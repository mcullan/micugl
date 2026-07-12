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
