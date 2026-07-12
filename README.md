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
  continuous render loop entirely; `invalidate()` calls are ignored.
- `'pause'` freezes the clock at its current value but keeps responding to `invalidate()` —
  useful for content that should stay interactive (theme changes, resize) without
  autonomous time-driven motion.
- `'ignore'` opts the axis out entirely: `<BaseShaderComponent reducedMotion="ignore" saveData="ignore" />`
  restores unconditional animation regardless of OS/network preference.
- `staticFrame` (default `0`) is the poster frame number, on the same 60fps timebase as
  `setFrame`/`ShaderHandle`. Pick a frame that looks good as a static image for shaders
  that are dull at frame 0.

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
