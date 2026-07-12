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
