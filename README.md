# micugl

miccull's shader library for simple React shaders. 

Includes a WebGL manager, core utilities, and two React components for single‑pass and ping‑pong shaders.

## Install

```bash
npm install micugl
# or
bun add micugl
```

## Getting Started

```tsx
import React from "react";
import { BaseShaderComponent, createShaderConfig } from "micugl";

import vertexShader from "./shaders.vert";
import fragmentShader from "./shaders.frag";

const shaderConfig = createShaderConfig({
  vertexShader,
  fragmentShader,
  uniformNames: {
    u_myColor: "vec3",
  },
});

export default function App() {
  return (
    <BaseShaderComponent
      programId="my-shader"
      shaderConfig={shaderConfig}
      uniforms={{
        time: { type: "float", value: (t) => t * 0.001 },
        resolution: {
          type: "vec2",
          value: () => [window.innerWidth, window.innerHeight],
        },
        myColor: { type: "vec3", value: [1, 0, 0] },
      }}
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
```

## Core

- **WebGLManager**  
  Low‑level wrapper around WebGLRenderingContext.

  - `new WebGLManager(canvas, options?)`
  - `createProgram(id, config)` → compile/link shaders
  - `createBuffer(programId, attribute, data)`
  - `setUniform(programId, name, value, type)`
  - `prepareRender(programId, { clear?, clearColor? })`
  - `drawArrays(...)`, `drawElements(...)`
  - `fbo: FBOManager` for ping‑pong framebuffers

- **`createShaderConfig`**
  - Builds a ShaderProgramConfig with defaults (`u_time`, `u_resolution`).
  - `createShaderConfig({ vertexShader, fragmentShader, uniformNames?, attributeConfigs? })`

- **Utilities**
  - `FBOManager` for multi‑render targets
  - `Passes` / `Postprocessing` to sequence render passes

## React Components

### BaseShaderComponent

| Prop                | Type                                        | Notes                         |
| ------------------- | ------------------------------------------- | ----------------------------- |
| programId           | string                                      | identifier for the shader     |
| shaderConfig        | ShaderProgramConfig                         | from createShaderConfig       |
| uniforms            | { [name]: { type: UniformType; value } }    | static value or updater fn    |
| renderOptions       | { clear?: boolean; clearColor?: [r,g,b,a] } | default clears to black       |
| useFastPath         | boolean                                     | skip callback for simple draw |
| useDevicePixelRatio | boolean                                     | adapt canvas to DPR           |

### BasePingPongShaderComponent

| Prop                  | Type                                            | Notes                               |
| --------------------- | ----------------------------------------------- | ----------------------------------- |
| programId             | string                                          | first‑pass shader                   |
| secondaryShaderConfig | ShaderProgramConfig                             | ping‑pong second pass               |
| iterations            | number (default 1)                              | update/display cycles               |
| uniforms              | { [name]: { type; value } }                     | for primary pass                    |
| secondaryUniforms     | { [name]: { type; value } }                     | for secondary pass                  |
| framebufferOptions    | { width; height; textureCount; textureOptions } | default full‑canvas two‑texture FBO |

### Hooks

- **useUniformUpdaters(programId, uniforms)** → React memoized uniform updaters
- **usePingPongPasses(options)** → { passes, framebuffers } for engine
- **useDarkMode()** → boolean dark‑mode flag
- **useReducedMotion()** → boolean, live `prefers-reduced-motion: reduce` state
- **useSaveData()** → boolean, live `navigator.connection.saveData` state

## Reduced motion & Save-Data

Both engines respect `prefers-reduced-motion` and the Save-Data hint **on by default**
(`reducedMotion="static-frame"`, `saveData="static-frame"`). This is a pre-1.0 behavior
change: a canvas rendered for a user with either preference active now freezes on a single
deterministic frame instead of animating continuously.

- `reducedMotion` / `saveData`: `'static-frame' | 'pause' | 'ignore'` (default `'static-frame'`
  for both). When either axis is active, the most restrictive configured policy wins.
- `'static-frame'` draws one poster frame (at `staticFrame`, default `0`) and stops the
  continuous render loop entirely. The clock stays pinned to `staticFrame`, so nothing
  time-driven advances; an explicit `invalidate()` still redraws that one pinned frame, so
  value changes (theme, resize, a snapped transition) reach the canvas.
- `'pause'` freezes the clock at its current value but keeps responding to `invalidate()` —
  useful for content that should stay interactive (theme changes, resize) without
  autonomous time-driven motion.
- `'ignore'` opts the axis out entirely: `<BaseShaderComponent reducedMotion="ignore" saveData="ignore" />`
  restores unconditional animation regardless of OS/network preference.
- `staticFrame` (default `0`) is the poster frame number, on the same 60fps timebase as
  `setFrame`/`ShaderHandle`. Pick a frame that looks good as a static image for shaders
  that are dull at frame 0.

## Uniform transitions

Give a uniform param a `transition` and a change to its `value` animates to the new value
instead of stepping to it:

```tsx
<BaseShaderComponent
    programId='marble'
    shaderConfig={config}
    uniforms={{
        swirl: { type: 'float', value: hovered ? 1 : 0, transition: { duration: 400 } },
        color: {
            type: 'vec3',
            value: dark ? DARK : LIGHT,
            transition: { duration: 600, easing: 'easeInOut', delay: 100 }
        }
    }}
/>
```

- `transition: { duration, easing?, delay?, interpolate? }`. `duration` and `delay` are in
  milliseconds. `easing` is one of `'linear' | 'easeIn' | 'easeOut' | 'easeInOut'` (default
  `'linear'`), or your own `(t: number) => number`. `interpolate` replaces the default
  component-wise lerp, for cases like color-space-aware blending.
- Supported on `float`, `vec2`, `vec3` and `vec4`. A transition on any other type, or on a
  function-valued uniform, throws: there is no sensible interpolation to fall back to, and a
  silently ignored transition is worse than an error.
- Interpolation happens at frame time, inside the uniform read. A transition costs no React
  renders and no GL re-initialization, and the existing dirty check still means only changed
  values are uploaded.
- Mounting snaps: the first value a uniform is given is its starting value, never animated
  from zero. Retargeting mid-flight starts the new leg from the current interpolated value.

**Transitions run on the engine clock, not on wall time.** `speed` scales them (`speed={0.5}`
halves their pace, `speed={0}` freezes them), and `setFrame(n)` pins them, which is what makes
them deterministic: the same frame number always produces the same interpolated value, so
`renderSequence()` and `renderToBlob({ frame })` capture transitions exactly.

**A motion gate snaps them.** Under `reducedMotion="static-frame"`/`"pause"` (the default, when
the user has `prefers-reduced-motion: reduce` or Save-Data on) the render clock is frozen, so a
tween sampled on engine time physically cannot advance; micugl snaps the uniform to its target
and repaints once rather than leaving it stuck at its old value. The deliberate consequence:
`reducedMotion="ignore"` (the user has told you their motion is fine) keeps transitions
animating.

**`frameloop='never'` still animates them.** A transition wakes the loop through the same
invalidate channel `handle.invalidate()` uses, and keeps it awake until it settles, then lets it
go idle again. `'never'` means "render only when something invalidates", not "never render" -
the prop for never advancing anything is `speed={0}`.

**Worker mode rejects them.** Transitions are interpolated on the main thread every frame and
worker mode posts plain values, so a `transition` under `worker` would be silently ignored and
the uniform would jump. That combination throws with the remedy in the message. Sampling
transitions on the main thread and posting them through the `liveUniforms` channel is a
follow-up.

## Worker rendering (OffscreenCanvas)

`worker` moves the GL context and the render loop off the main thread, onto an
`OffscreenCanvas` inside a Web Worker. The picture is identical; the difference is that
main-thread jank (React renders, layout, long tasks) no longer stalls the animation.

```tsx
<BaseShaderComponent worker programId='blob' shaderConfig={config} uniforms={uniforms} />
```

- `worker={true}` — always use a worker. If a uniform or a prop cannot cross the worker
  boundary, micugl **throws** and names the uniform and the remedy.
- `worker="auto"` — use a worker when this browser and this component's props allow it, and
  fall back to main-thread rendering otherwise. `"auto"` never throws.
- `worker={false}` (default) — main-thread rendering, unchanged.

### Shipping the worker: CSP

By default micugl builds the worker from an **inlined blob**, so there is no worker file to
copy, host, or version, and nothing to configure. A strict Content-Security-Policy will block
that. Two supported fixes, both first-class:

1. Allow blob workers in your CSP:

   ```
   worker-src 'self' blob:;
   ```

2. Or build the worker yourself from the `micugl/worker` export and keep `worker-src 'self'`:

   ```tsx
   <BaseShaderComponent
       worker
       createWorker={() => new Worker(new URL('micugl/worker', import.meta.url), { type: 'module' })}
       ...
   />
   ```

If the worker cannot be started, micugl logs once, explains the remedy, and renders on the main
thread instead: same picture, no worker. Two ways that happens, and they are detected at
different moments:

- **No `OffscreenCanvas` / `Worker` support**: decided before anything is transferred.
- **A CSP that forbids the worker**: Chromium does *not* throw from `new Worker(blob:...)` — it
  blocks the worker asynchronously, so a page under a strict CSP hands back a `Worker` object
  whose script never runs. micugl only learns this when that worker fires `error` without ever
  having started, which is necessarily after the canvas was transferred to it. micugl then
  discards the transferred canvas, mounts a fresh one, and renders on the main thread.

A component that has fallen back stays on the main thread for the rest of its life, even if you
toggle `worker` back on: whatever stopped the worker from starting (no support, a CSP) will not
have changed. Remount the component if you need it to try again.

The fallback is always safe because **worker mode's uniform rules are a strict subset of
main-thread mode's**: anything that can run in a worker can also run on the main thread, so
falling back can only cost you the threading benefit, never the picture.

Those two are the *only* fallbacks. A worker that started and then threw an uncaught error is a
bug, not a configuration problem, so micugl surfaces it: the error is thrown from the
component's render (catchable by an error boundary) and there is no fallback, because a fallback
would hide it. The two cases are told apart by the `error` event itself — a worker whose script
was never allowed to run fires a bare `Event`, while a worker that ran and threw fires an
`ErrorEvent` carrying the exception's message.

### Uniforms in worker mode

A worker cannot call your functions, so a function-valued uniform cannot simply be sent across.

- **Plain values** (`number`, `number[]`, typed array) are posted when they change, and are
  dirty-checked on both sides. This is the normal path; use it for anything you drive from
  React state.
- **`u_time` and `u_resolution`** are computed inside the worker, from its own frame clock and
  the canvas size. Do not pass them as functions: micugl throws rather than let the worker
  quietly compute a different value than the one you wrote.
- **`liveUniforms`** (`BaseShaderComponent` / `ShaderEngine` only) names function-valued
  uniforms that micugl evaluates on a main-thread `requestAnimationFrame` and posts every
  frame:

  ```tsx
  <BaseShaderComponent
      worker
      uniforms={{ mouse: { type: 'vec2', value: () => pointerRef.current } }}
      liveUniforms={['mouse']}
      ...
  />
  ```

  This costs you a main-thread rAF (the thing worker mode exists to avoid), so keep the list
  short, or empty. The `time` argument these functions receive comes from the **main thread's**
  clock and can drift slightly from the worker's, so `liveUniforms` is for inputs that do not
  depend on time (pointer, scroll, sensors). Time-driven uniforms belong in the shader, where
  `u_time` is exact.
- Any other function-valued uniform throws under `worker={true}` and downgrades to the main
  thread under `worker="auto"`.
- `liveUniforms` does not cover ping-pong pass uniforms in v1, which is why the ping-pong
  components do not accept the prop. A `customPasses` entry may not carry a function-valued
  pass uniform in worker mode, not even `u_time`: the worker cannot call your function, and
  computing its own built-in instead would draw a different picture. Give the pass uniform a
  plain value, let micugl build the ping-pong passes for you (their uniforms are posted to the
  worker), or turn worker mode off on that component.

### v1 non-goals

Worker mode leaves no WebGL context on the main thread, and the following features need one.
In worker mode they throw, naming the remedy (turn worker mode off on that component):

- `renderToBlob()`, `renderToDataURL()`, `captureStream()`, `record()`, `renderSequence()`,
  and `resetSimulation()`.
- `getFrame()`: the render clock lives in the worker and cannot be read synchronously from the
  main thread. Drive the clock instead with `setFrame(frame)`.
- Devtools (`debug`): there is no main-thread context to inspect. `debug` + `worker` logs once
  and inspects nothing.
- A custom `renderCallback` on `ShaderEngine`: worker mode requires the fast path, so it throws
  under `worker={true}`.
- Instancing: `worker` and `instancing` together are a **compile error** on `ShaderEngine` (the
  worker props are a discriminated union), and throw at runtime if the types are bypassed.

`invalidate()`, `setFrame()`, `start()`, `stop()`, `frameloop`, `speed`, `pauseWhenHidden`,
`dpr`, `fit`, `reducedMotion` / `saveData` and the IntersectionObserver / visibility pausing all
work exactly as they do on the main thread.

### Seeing it work

The demo app has a side-by-side scene: the same shader rendered by a worker component and a
main-thread component, with a button that blocks the main thread with a synchronous busy loop.
The worker canvas keeps animating through the block; the main-thread canvas freezes.

```
bun run dev
# then open /?scene=worker-jank
```

`?scene=worker-context-loss` renders a worker component whose worker is built by a
`createWorker` prop (a real module worker, no blob), and exposes hooks that force a WebGL
context loss and restore inside the worker.

## Deterministic capture

Both `ShaderEngine` and `PingPongShaderEngine` expose `renderToBlob(options?)` and
`renderToDataURL(options?)` on their ref handle for deterministic still capture, without
requiring `preserveDrawingBuffer: true` on the visible canvas.

```tsx
const ref = useRef<ShaderHandle>(null);

// capture the current frame at display resolution, as a PNG blob:
const png = await ref.current!.renderToBlob();

// capture a specific frame number at a custom resolution:
const custom = await ref.current!.renderToBlob({ frame: 90, width: 1280, height: 720 });

// capture at 2x the current backing resolution:
const hiRes = await ref.current!.renderToBlob({ scale: 2 });
```

`RenderToBlobOptions`:

| Option    | Type              | Notes                                                            |
| --------- | ----------------- | ----------------------------------------------------------------- |
| `frame`   | number            | frame number (60fps timebase, same units as `setFrame`); default: current clock |
| `width`   | number            | export width in device pixels; must be paired with `height`      |
| `height`  | number            | export height in device pixels; must be paired with `width`      |
| `scale`   | number             | alternative to `width`/`height`: multiplies the current backing size |
| `type`    | string            | MIME type, default `'image/png'`                                 |
| `quality` | number            | `0..1`, for lossy types                                          |
| `seed`    | `SeedOptions`     | ping-pong only: reset the simulation before capture               |
| `steps`   | number            | ping-pong only: run this many deterministic steps from the seed before capture |
| `fps`     | number            | ping-pong only: step interval when `steps` is given, default `60` |

Time is always expressed as **frame numbers** on the library's 60fps timebase (matching
`setFrame`/`getFrame`), not seconds or milliseconds. `width`/`height` cannot be combined
with `scale`; `seed` and `steps` must be provided together; `fps` requires `steps`; and
`frame` cannot be combined with `seed`/`steps` (the step schedule defines the time).

Custom-resolution capture (`width`/`height` or `scale`) renders into an offscreen
framebuffer sized to the exact requested dimensions — it bypasses the display's `dpr` and
`maxPixelCount` clamping entirely, so the exported pixel dimensions are always exactly
what you asked for. Requested dimensions are checked against
`gl.getParameter(gl.MAX_TEXTURE_SIZE)` and rejected loudly if they exceed it, rather than
silently clamping.

### Ping-pong simulations

`PingPongShaderEngine`'s handle additionally exposes `resetSimulation(seed?)`. A
**generated** ping-pong chain (built via `usePingPongPasses`, with no custom passes) is a
pure function of frame number — it re-seeds every frame — so `renderToBlob({ frame })`
works exactly like a time-driven shader.

A **custom** chain using `readwrite` bindings (or any framebuffer left unwritten before
being read) accumulates state across frames and is not a pure function of frame number.
Calling `renderToBlob({ frame })` on such a chain throws instead of silently returning a
frame that depends on unrelated prior rendering. Deterministic export of an accumulating
simulation instead uses `seed` + `steps`:

```tsx
const frame = await ref.current!.renderToBlob({
  seed: { kind: 'clear', color: [0, 0, 0, 0] },
  steps: 120,
  fps: 60,
});
```

This resets the simulation, advances it exactly `steps` deterministic ticks from the seed,
and captures the resulting frame — the same `(seed, steps, fps)` always produces the same
output on a given GPU/driver.

Custom-resolution export of a ping-pong engine re-renders only the final (colorize) pass
at the requested size; the simulation itself keeps running at its own configured
resolution.

### Caveats

- WebGL rendering is not guaranteed to be bit-exact across different GPUs/drivers —
  capture is byte-identical for repeated calls and reloads on the **same** machine/GPU
  backend, but goldens generated on one backend (e.g. Metal) may not match another (e.g.
  SwiftShader/software rendering) exactly. Use a tolerance when comparing across machines.
- `renderToBlob`/`renderToDataURL` throw if the WebGL context is lost, the engine hasn't
  finished initializing, or (for `ShaderEngine`) a custom resolution is requested while
  using the non-fast render-callback path (custom-resolution export requires
  `useFastPath`).

## Video export

Both engines' ref handle also expose two video paths: `captureStream(fps?)` +
`record(options?)` for realtime recording, and `renderSequence(options)` for offline,
exact-fps, frame-stepped export via WebCodecs.

### `record()` — realtime, drops possible

```tsx
const ref = useRef<ShaderHandle>(null);

const recording = ref.current!.record({ fps: 60 });
setTimeout(async () => {
  const webm = await recording.stop();
  // upload/download webm
}, 5000);
```

`record()` wraps `canvas.captureStream()` + `MediaRecorder`. It records whatever the
canvas actually draws in realtime, so frames can drop under load — it is not frame-exact.
It throws if the engine is currently motion-gated (`reducedMotion`/`saveData` resolved to
`'static-frame'` or `'pause'`), because recording a frozen or interaction-only poster is
almost always a mistake; set `reducedMotion="ignore"`/`saveData="ignore"` on the engine,
or use `renderSequence()` instead, which drives its own frames independently of the loop
mode. `recording.cancel()` discards the in-progress recording without producing a blob.

### `renderSequence()` — offline, exact-fps

```tsx
// 4 seconds at 30fps, webm/VP9, no dropped frames:
const webm = await ref.current!.renderSequence({ fps: 30, durationSeconds: 4 });

// dependency-free: raw VideoFrames, no muxer required
await ref.current!.renderSequence({
  fps: 30,
  frames: 90,
  container: 'none',
  onFrame: (frame, index) => {
    // consume synchronously or copy — the frame is closed right after this returns
  },
});
```

`renderSequence` steps the deterministic clock exactly once per output frame (no realtime
drift, no dropped frames) and encodes each frame with `VideoEncoder`. It **requires a
secure context** (`localhost`/`https`) — `VideoEncoder`/`VideoFrame` are unavailable on
plain `http://` origins in browsers that support WebCodecs at all, and `renderSequence`
throws a clear error rather than silently falling back to realtime capture.

The default codec is VP9 (`vp09.00.10.08`) for both `webm` and `mp4` containers — **many
Chromium builds (including headless Playwright's bundled Chromium) have no H.264
(`avc1`) encoder**, only VP8/VP9/AV1 software encode. Passing an `avc1.*` codec that
`VideoEncoder.isConfigSupported` rejects throws an error suggesting VP9/AV1 or the
scripted ffmpeg recipe below.

Producing a `webm`/`mp4` container requires a muxer as an **optional peer dependency**,
loaded via dynamic `import()` only when needed:

```
npm i webm-muxer
# or: npm i mp4-muxer
```

If neither is installed, `renderSequence` throws telling you to install one or pass
`container: 'none'` with `onFrame`, which hands you raw `VideoFrame`s with no muxer
dependency at all.

`SequenceOptions`:

| Option           | Type                                     | Notes                                                              |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `fps`            | number                                     | required; output frame rate                                        |
| `frames`         | number                                     | exactly one of `frames`/`durationSeconds` is required               |
| `durationSeconds`| number                                     | exactly one of `frames`/`durationSeconds` is required               |
| `startFrame`     | number                                     | library frame number to start at (60fps timebase); default `0`; cannot combine with `seed` |
| `codec`          | string                                     | default `'vp09.00.10.08'`                                           |
| `container`      | `'webm' \| 'mp4' \| 'none'`                | default `'webm'`; `'none'` requires `onFrame`                       |
| `bitrate`        | number                                     | default `8_000_000`                                                |
| `seed`           | `SeedOptions`                              | ping-pong only: reset before the sequence (see below)               |
| `onFrame`        | `(frame: VideoFrame, index: number) => void` | called before encoding each frame; required when `container: 'none'` |
| `signal`         | `AbortSignal`                              | aborts the sequence loop between frames                             |

Sequence export renders at the canvas's current backing size — custom export dimensions
are not supported by `renderSequence` in this version; size the canvas explicitly before
calling it.

### Ping-pong sequences

For a **time-pure** generated chain, `renderSequence` steps the same library clock
`renderToBlob` uses (`startFrame + i * (60 / fps)`, converted to ms). For an
**accumulating** custom chain, a `seed` is required — `renderSequence` resets the
simulation and steps it forward at `i * (1000 / fps)` ms per output frame, matching
`resetSimulation`/`renderToBlob({ seed, steps })` semantics. Passing `seed` on a
time-pure chain opts into the same seeded schedule. After the sequence finishes (or
throws), the display is restored to the current clock frame — unless a seed was used, in
which case the seeded state becomes the new current simulation state, exactly like
`resetSimulation`.

### Scripted, frame-exact H.264 (recipe, not library code)

When you need real H.264 and control the rendering environment yourself (CI, a build
script), drive the canvas with Playwright instead of `renderSequence`:

1. Launch headless Chromium with a real GPU on macOS: `--use-angle=metal` (or
   `--enable-gpu`) — default headless falls back to SwiftShader software rendering.
2. For each frame `i`, call `ref.setFrame(i)` and capture a PNG (`renderToDataURL`/
   `page.screenshot`).
3. Assemble the PNG sequence with ffmpeg, forcing `yuv420p` (PNG frames carry an alpha
   channel even for opaque canvases, which `yuv420p` doesn't support unless forced):

   ```
   ffmpeg -framerate 30 -i frame_%d.png -pix_fmt yuv420p out.mp4
   ```

## Development

| Script                | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `bun run dev`         | demo app (scenes live in `demo/scenes`, selected with `?scene=`)         |
| `bun run typecheck`   | `tsc --noEmit`                                                          |
| `bun run lint`        | eslint (`strictTypeChecked`, no `eslint-disable`, ASCII-only source)     |
| `bun run test`        | vitest: pure-logic + jsdom component tests                               |
| `bun run build`       | library build + worker build + tree-shaking assertions                   |
| `bun run bench`       | Playwright GL-counter benchmarks over the demo scenes (`bench/`)         |
| `bun run test:e2e`    | Playwright browser tests for worker mode (`e2e/`)                        |

CI runs `typecheck + lint + test + build`. `bench` and `test:e2e` need a browser, so they are
run on demand rather than in the gate.

`test:e2e` is the only place the real `transferControlToOffscreen()` path is exercised: jsdom
has no OffscreenCanvas, so the component tests stub it. It boots two servers — the dev server
(React in dev mode, so `StrictMode` double-invokes effects) and a production build served by
`vite preview` (where the worker really is an inlined blob, as it is for consumers) — and every
worker assertion is gated behind positive proof that a worker is driving the canvas: a `Worker`
was constructed, the canvas throws `InvalidStateError` from `getContext` because it was
transferred, and no main-thread GL context exists for it. A silent fallback to main-thread
rendering fails those tests instead of quietly passing them.
