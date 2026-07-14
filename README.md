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

## Embed (loading screens, no React)

`micugl/embed` is a standalone micro-runtime that renders one animated fullscreen fragment
shader **before or without** React. It is a separate ~1.8 KB gzip runtime, not a re-export of
`micugl/core`: it has no FBOs, no ping-pong, no capability probing and no resource registry,
because a loading screen needs none of them. (`WebGLManager` builds an `FBOManager` and probes
four extensions in its constructor, which costs ~4.4 KB gzip for a fullscreen quad. CI enforces
the embed runtime's size budget so it cannot drift back toward that.)

```js
import { embed } from "micugl/embed";

const handle = embed(document.getElementById("loader"), {
  fragment: FRAGMENT,           // your fragment shader source
  uniforms: { u_tint: [0.2, 0.4, 0.9] },
  clearColor: [0, 0, 0, 1],     // default [0,0,0,1]
  dpr: [1, 2],                  // same meaning as the React dpr prop, default [1,2]
  contextAttributes: {},        // merged over { alpha:false, antialias:false, depth:false,
                                //               stencil:false, powerPreference:'low-power' }
});

// later, once the real app has painted:
handle.destroy();
```

Your fragment shader receives `uniform float u_time` (seconds), `uniform vec2 u_resolution`
(drawing-buffer pixels) and the 0..1 quad coordinate under **both** names the library's shaders
use, `varying vec2 v_uv` and `varying vec2 v_texCoord` (the examples in this README all name it
`v_texCoord`), so a fragment shader written for a React component drops straight in.
The canvas is sized to the viewport, so give it `position:fixed;inset:0`.

`dpr` mirrors the React `dpr` prop exactly: a **tuple** `[min, max]` clamps `devicePixelRatio` into
that range (default `[1, 2]`, so a 3x phone renders at 2x and a zoomed-out 0.5x window still renders
at 1x), and a **number** is a fixed ratio (`dpr: 2` renders at 2x even on a 1x display). Unlike the
React components, embed does **not** apply a `maxPixelCount` cap (React defaults to 8,294,400 px);
a loading screen is one cheap fullscreen quad, so pass `dpr: 1` if you need a hard floor on cost.

`embed()` returns `{ canvas, gl, animating, destroy }`. `animating` is live: it is `false` when the
motion gate rendered a poster instead of starting the loop, and `false` after `destroy()`.
`destroy()` cancels the loop, removes the resize and context-loss listeners, deletes the
program/shaders/buffer and calls `WEBGL_lose_context.loseContext()`, so a later React mount on a
fresh canvas is a clean handoff. It is idempotent.

If the WebGL context is lost (GPU-process restart, mobile tab eviction) the canvas stops updating;
embed does not restore it, but it logs a `micugl/embed:` prefixed error rather than going silently
blank. Recover by removing the canvas and calling `embed()` again on a fresh one.

### Static HTML (the `<script>` build)

`dist/embed.global.js` is a prebuilt minified IIFE for a static page with no bundler. Copy it out
of `node_modules/micugl/dist/` and it exposes `window.micuglEmbed`:

```html
<canvas id="loader" style="position:fixed;inset:0"></canvas>
<script src="/vendor/embed.global.js"></script>
<script>
  window.__loader = micuglEmbed.embed(document.getElementById("loader"), {
    fragment: `precision highp float; uniform float u_time; varying vec2 v_uv;
               void main(){ gl_FragColor = vec4(v_uv, 0.5 + 0.5 * sin(u_time), 1.0); }`,
  });
</script>
```

### Handing off to React

The loader owns its canvas and context for its whole life; React mounts its own component on a
**fresh** canvas. Mount React first, let it paint, and only then destroy the loader — destroying it
before React's first paint is the black-flash trap:

```jsx
function App() {
  useEffect(() => {
    // two frames: one to commit, one to let the browser paint it
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__loader?.destroy();
        document.getElementById("loader")?.remove();
      });
    });
    return () => { cancelAnimationFrame(outer) };
  }, []);

  return <RippleScene style={{ width: "100vw", height: "100vh" }} />;
}
```

Two GL contexts exist for that brief overlap, which browsers allow. A ~200 ms opacity crossfade on
the loader canvas works the same way: fade first, destroy on transition end.

### Reduced motion & Save-Data

`embed()` honors `prefers-reduced-motion` and the Save-Data hint **on by default**, consistent with
the React components (see below). When either is active it draws exactly one poster frame and never
starts the rAF loop; `handle.animating` reports which happened.

- `reducedMotion` / `saveData`: `'static-frame' | 'pause' | 'ignore'` (the same `MotionPolicy`
  members as the React props), default `'static-frame'`. Only `'ignore'` animates: `'pause'` folds
  to a static frame here, because a loading screen's clock starts at 0, so pausing it at its current
  time and posing it at frame 0 are the same picture. Anything else — a typo, a value from a CMS —
  gates rather than animating, since the `<script>` build has no TypeScript to catch it.
- `staticFrame` (default `0`) is the poster frame, on the same 60fps timebase as the React
  `staticFrame` prop, so a poster picked for the React component reproduces exactly here. With an
  explicit `staticFrame`, a gated embed shows that poster rather than frame 0.
- A loading screen that animates against a user's OS accessibility preference while the rest of the
  library respects it would read as a bug, so opting out is explicit: `reducedMotion: 'ignore'`.
- The media query is read **once**, at `embed()`. React's `useReducedMotion` subscribes and reacts
  live; a loading screen lives for a few seconds, so embed spends no bytes on a listener. If the user
  flips the OS preference mid-load, the loader keeps whatever it started with.

### Failing loud, and the one place it does not

Everything fails loud with a `micugl/embed:` prefixed error: no WebGL context, shader compile
failure (info log included), program link failure, and a uniform that is not a finite number or an
array of 2 to 4 finite numbers.

The **one deliberate exception**: a uniform whose `getUniformLocation` returns `null` has its
**upload** skipped, not thrown. GLSL compilers legitimately optimize out declared-but-unused
uniforms, so `null` is an expected outcome that is indistinguishable from a typo at the GL level.
`WebGLManager` already behaves this way. If a uniform seems to have no effect, check that the shader
actually reads it. The **value is still validated**: `{ u_tint: 'red' }` or a `NaN` from a
`done / total` with `total === 0` throws whether or not the shader kept the uniform, so a bad value
cannot hide behind a renamed uniform.

Caller uniforms are set **once**, at init. Only `u_time` and `u_resolution` are live per frame;
animate everything else from `u_time` inside the shader.

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
- **useImageTexture(input, options?)** → { texture, status, error } for the `textures` prop
- **useVideoTexture(input, options?)** → { texture, status, error, video } for the `textures` prop
- **useWebcamTexture(options?)** → { texture, status, error, start, stop, stream } for the `textures` prop
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

### What repaints the poster, and what freezes

Under a `static-frame` or `pause` gate the render loop is off, so the canvas only repaints
when something asks for a **discrete** repaint — a "one thing changed, show it once" event:
a changed plain uniform value (theme, resize, a prop-driven `u_color`), a snapped transition,
a devtools override. A per-frame **continuous** stream — a live audio level, a webcam frame,
anything that wants the *next* frame of an ongoing animation — is suppressed by the gate; it
never schedules a frame while gated.

That distinction is carried by `InvalidationKind` on the `FrameInvalidation` you connect to a
custom uniform (see [Waking a `demand` engine from your own value
producer](#waking-a-demand-engine-from-your-own-value-producer)):

- `request()` (or `request('discrete')`) — "a value changed, repaint the poster." Fires under
  a gate. Use it for producers that emit on discrete state changes.
- `request('continuous')` — "I want the next frame of a stream." Suppressed under a gate. Use
  it for a source you sample every frame (a `requestVideoFrameCallback` webcam, an rAF loop).

A gated audio visualizer follows the same rule: while a source is running the poster **freezes
at the last sampled values** (the driver keeps analysing for any un-gated engine sharing it,
but this engine will not schedule frames), and `stop()` drains the bands to zero and repaints
that drained poster once, because stopping is a discrete state change. If the visualizer *is*
the point of the page and should animate for everyone, opt the component out with
`reducedMotion="ignore"` / `saveData="ignore"` — there is no per-source override.

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

**Springs** are the other driver: swap `{ duration, easing?, delay?, interpolate? }` for
`{ type: 'spring', stiffness?, damping?, mass?, restDelta?, restSpeed? }`.

```tsx
color: {
    type: 'vec3',
    value: isDarkMode ? colorStartDark : colorStart,
    transition: { type: 'spring', stiffness: 170, damping: 26 }
}
```

- Defaults: `stiffness: 170`, `damping: 26`, `mass: 1`, `restDelta: 0.001`, `restSpeed: 0.01` -
  a semi-implicit-Euler damped spring that is just this side of critically damped, so it settles
  without a visible bounce. Lower the damping (or raise the stiffness) for an overshoot-and-settle
  feel instead.
- The spring integrates on a fixed substep - 1/120s, and finer when a stiff or heavily damped
  config needs it to stay stable - regardless of the actual frame rate, so a janky tab and a smooth
  one follow the same trajectory instead of the integrator diverging under a large per-frame `dt`.
  A gap longer than 100ms (a tab waking from being backgrounded) is clamped, so a spring that has
  been idle for minutes does not lurch through a decade of simulated time on the next frame.
- Retargeting a spring mid-flight **preserves velocity** instead of resetting it to zero - that is
  the defining difference from a tween's retarget. A fast double-click chases the new target from
  wherever the spring already was moving, instead of visibly stopping dead and restarting.
- `stiffness`, `damping` and `mass` must be finite and strictly positive; `restDelta` and
  `restSpeed` must be finite and non-negative; and a spring so stiff, or so light, that no
  affordable substep could integrate it stably throws at config resolution rather than uploading
  the garbage a diverging integrator produces. `damping: 0` throws too: an undamped spring never
  comes to rest, so it would oscillate around its target forever, animating and holding the render
  loop awake for as long as it is mounted instead of letting it go idle.
- **A spring is an accumulator, not a function of time.** A tween's value at frame `n` depends only
  on `n`; a spring's depends on the whole sequence of frames it has been sampled at. So an
  in-flight spring cannot be reconstructed from a pinned frame the way a tween can: capture a
  spring by replaying the sequence from its start, or let it settle before capturing. Springs are
  still deterministic - the same sequence of sample times always produces the same output.
- **So the deterministic-capture calls throw while a spring is in flight**, rather than handing you
  a frame that will not reproduce: `renderSequence()`, and `renderToBlob({ frame })` /
  `renderToDataURL({ frame })` (plus the seeded `steps` export on `PingPongShaderEngine`) all pin a
  time the spring has not actually been integrated to. Wait for the spring to settle, or use a
  tween. The calls that do not synthesize a time are untouched, because they are honest about what
  they capture: `renderToBlob()` with no `frame` grabs the live clock - whatever is on screen right
  now - and `record()`/`captureStream()` record in real time, where a spring animating through the
  take is the whole point. An in-flight *tween* never blocks a capture: it is a pure function of
  the frame number, so `setFrame(n)` reproduces it exactly.
- The `?scene=transitions` demo has a tween/spring toggle next to the palette buttons - click a
  palette, then a different one before the first animation finishes, to see mid-flight
  retargeting on both drivers.

**Transitions run on the engine clock, not on wall time.** `speed` scales them (`speed={0.5}`
halves their pace, `speed={0}` freezes them), and `setFrame(n)` pins them. For a tween that is what
makes it deterministic: the same frame number always produces the same interpolated value, so
`renderSequence()` and `renderToBlob({ frame })` capture tweens exactly. A spring is integrated
across frames rather than indexed by them, so those same calls throw while one is in flight - see
the spring caveat above.

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

## Audio-reactive uniforms

`useAudioUniforms` turns a microphone, an `<audio>`/`<video>` element, or an `AudioNode` you
already own into two uniforms: `u_audioBands` (1-4 log-spaced frequency bands packed into a
`float`/`vec2`/`vec3`/`vec4`) and `u_audioLevel` (their mean).

The element is `null` on the first render, so the visualizer has to wait for it. Hold the
element in state with a ref callback and render the visualizer only once it exists:

```tsx
const Visualizer = ({ element }: { element: HTMLAudioElement }) => {
    const audio = useAudioUniforms(
        { type: 'element', element },
        { bands: 4, attack: 0.01, release: 0.18 }
    );

    return (
        <>
            <BaseShaderComponent
                programId='audio-bars'
                shaderConfig={config}
                uniforms={{ ...audio.uniforms, intensity: { type: 'float', value: 1 } }}
                frameloop='demand'
            />
            <button type='button' onClick={() => { void audio.start() }}>play</button>
            {audio.status === 'error' && <p>{audio.error?.message}</p>}
        </>
    );
};

export const Player = () => {
    const [element, setElement] = useState<HTMLAudioElement | null>(null);

    return (
        <>
            <audio ref={setElement} src='/track.mp3' controls />
            {element && <Visualizer element={element} />}
        </>
    );
};
```

- `useAudioUniforms(source, options?)` returns `{ uniforms, start, stop, status, error }`.
  `source` is `{ type: 'mic' }`, `{ type: 'element', element }` or `{ type: 'node', node, context }`.
- **`start()` needs a user gesture.** Call it from a click, not on mount: browsers require a
  gesture for `getUserMedia` and for resuming a suspended `AudioContext`. It returns a promise
  that rejects on a denied permission or an insecure context, and the same failure is reported
  through `status === 'error'` and `error`.
- `stop()` releases everything the hook owns: the microphone track stops (the OS recording
  indicator goes out), a mic `AudioContext` is closed, and the uniforms fall back to zero.
  Unmounting stops the driver too. `stop()` never disconnects a media element from the
  speakers - stopping the visualizer does not stop the music.
- Options: `bands` (1-4, default 4), `fftSize`, `smoothingTimeConstant`, `attack`/`release`
  (an asymmetric envelope in seconds - fast attack, slow release, which the analyser's own
  symmetric smoothing cannot express), `minDecibels`/`maxDecibels`, `bandLayout`
  (`'log' | 'linear'`), and `names` to rename the two uniforms. A statically-invalid option
  (a `bands` outside 1-4, an `fftSize` that is not a power of two, a negative `attack`) throws
  during render, before any WebAudio object exists. A `bands`/`fftSize` combination that is only
  impossible against the device's *actual* sample rate - too few bins between the band edges to
  split - cannot be caught statically: it throws from `start()` or from the reconfigure, and
  surfaces as `status === 'error'` with the reason in `error`.
- A third argument, `deps`, lets you inject your own `AudioContext` factory and `getUserMedia`
  (`{ createContext, getUserMedia }`). It is read once, when the hook builds its driver; changing
  it afterwards is deliberately ignored, because the hook owns one audio graph for its whole life.
- Analysis is **frame-driven**: it runs inside the uniform read, once per rendered frame. There
  is no second rAF loop, an engine that is paused, hidden or offscreen does no audio work at
  all, and `frameloop='demand'` works - the driver wakes the loop every time it analyses, so the
  loop keeps itself alive while audio is running and goes idle again the moment you `stop()`.
- The band count decides the uniform's type, so changing `bands` means changing the uniform's
  declaration in the shader too (`vec4` -> `vec2`).
- One hook instance owns one audio graph for its whole life. Changing the `source` under a live
  hook throws; give the component a `key` that changes with the source so the old graph is
  stopped before the new one is built.
- Worker mode works: audio uniforms are function-valued, so list them in `liveUniforms` and the
  main thread samples them each frame and posts the values to the worker.
- **A running audio scene cannot be exported deterministically.** The envelope integrates frame
  to frame, and every frame reads whatever the microphone or media element happens to be playing,
  so `renderSequence()` and `renderToBlob({ frame })` - the two calls that synthesize a frame time
  - throw while `status === 'running'`, and the message says so. Call `stop()` first and the same
  export works. The honest live captures (`renderToBlob()` with no frame, `record()`,
  `captureStream()`) render the real clock and are never blocked.
- Known limitation: a CORS-tainted media element (cross-origin audio without permissive CORS
  headers) feeds the analyser silent zeros. The browser reports no error, so neither can micugl:
  `status` reads `'running'` and the uniforms read 0.

### Waking a `demand` engine from your own value producer

`useAudioUniforms` is built on two public pieces you can use directly for any live input of your
own (a webcam, a MIDI knob, a websocket). `UniformParam.invalidation` takes a `FrameInvalidation`;
whenever your producer calls `request()`, every engine using that uniform renders a frame. Under
`frameloop='always'` it is a no-op; under `'demand'` it is the whole scheduling mechanism.

```tsx
const pointerInvalidation = useMemo(() => createFrameInvalidation(), []);
const pointerRef = useRef<[number, number]>([0, 0]);

useEffect(() => {
    const onMove = (event: PointerEvent) => {
        pointerRef.current = [event.clientX, event.clientY];
        pointerInvalidation.request();
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove) };
}, [pointerInvalidation]);

<BaseShaderComponent
    programId='trail'
    shaderConfig={config}
    frameloop='demand'
    uniforms={{
        u_pointer: {
            type: 'vec2',
            value: () => pointerRef.current,
            invalidation: pointerInvalidation
        }
    }}
/>
```

`invalidation` must be **referentially stable**. The engine diffs the connected set by object
identity, so an inline `createFrameInvalidation()` or `combineFrameInvalidation([...])` built
during render would connect and dispose on every render. Memoize it (or hold it in a ref), as
above. `combineFrameInvalidation` merges several producers into one when a uniform is woken by
more than one source.

`request()` takes an optional `InvalidationKind`. A producer that emits when a discrete thing
changed — a pointer moved, a websocket message arrived — calls `request()` (its default,
`'discrete'`), and its repaint reaches the canvas even under a reduced-motion gate. A producer
that samples a continuous stream every frame — a `requestVideoFrameCallback` webcam, an rAF
loop — calls `request('continuous')`, which drives `frameloop='demand'` at full rate but is
suppressed while the component is motion-gated, so a reduced-motion user gets the poster instead
of a live stream. When in doubt, `request()`: repainting a poster once is the safe default. See
[What repaints the poster, and what freezes](#what-repaints-the-poster-and-what-freezes).

## Effects

`micugl/effects` is a set of polished, prop-driven fullscreen components. Each rides
`BaseShaderComponent` (the fast path, no FBO), owns a local `speed` prop that is an in-shader
animation multiplier (not the engine clock scale), and takes an optional `audio` prop — the object
`useAudioUniforms` returns — whose LEVEL uniform drives a reaction. Colors are `Vec3` arrays of
`0..1` floats. Numbers must be finite and colors well-formed; the components throw a named error
rather than clamping or silently substituting. Every render prop except `speed` and the worker
props (`worker`, `createWorker`) is forwarded to `BaseShaderComponent`.

```tsx
import { MeshGradient, Grain } from 'micugl/effects';
```

### MeshGradient

Four color control points drift on seeded paths and blend by inverse-distance weighting, with a
value-noise domain warp for organic, non-radial edges. At `speed={0}` it is a still, seeded
composition — a deliberate poster:

```tsx
<MeshGradient speed={0} seed={3} colors={[[0.96, 0.76, 0.85], [0.74, 0.85, 0.96], [0.80, 0.95, 0.82]]} />
```

Animated, with audio:

```tsx
const audio = useAudioUniforms({ type: 'mic' });
<MeshGradient audio={audio} audioStrength={1.5} />;  // call audio.start() on a user gesture
```

| prop | type | default |
|---|---|---|
| `colors` | `Vec3[]` (2 to 4) | four pastels |
| `speed` | `number` | `0.2` |
| `warp` | `number` | `0.6` |
| `warpScale` | `number` | `1.2` |
| `seed` | `number` | `0` |
| `audio` | `AudioUniformsResult` | none |
| `audioStrength` | `number` | `1` |

Audio reaction: the warp depth grows with the audio level and the drift phase gets a bounded
forward push, so the gradient visibly breathes with the sound and settles back when it fades.

### Grain

Filmic white-noise grain re-seeded in ~24 fps steps, composited over a base color. At `speed={0}`
it is a single frozen grain field:

```tsx
<Grain speed={0} intensity={0.08} scale={2} />
```

Animated flicker over a dark base:

```tsx
<Grain color={[0.02, 0.02, 0.04]} grainColor={[0.95, 0.95, 1]} intensity={0.12} />
```

| prop | type | default |
|---|---|---|
| `color` | `Vec3` | `[0, 0, 0]` |
| `grainColor` | `Vec3` | `[1, 1, 1]` |
| `intensity` | `number` | `0.08` |
| `scale` | `number` (cell px) | `2` |
| `speed` | `number` | `1` |
| `audio` | `AudioUniformsResult` | none |
| `audioStrength` | `number` | `1` |

Audio reaction: the grain intensity scales with the audio level, so louder passages grain harder.

The `audio` prop must come from `useAudioUniforms` with its default uniform names; a custom
`names.level` option makes the effect throw, since it reads the level by its default name.

## Textures

Bind an image to a `sampler2D` with the `textures` prop. `useImageTexture` owns the decode
lifecycle and hands back a stable `TextureSource`; the prop assigns each entry a texture unit in
insertion order and declares the sampler for you.

```tsx
const image = useImageTexture(url);            // string | Blob | ImageBitmap | HTMLImageElement
                                               //   | HTMLCanvasElement | ImageData | null
const overlay = useImageTexture(file);

<BaseShaderComponent
  programId="scene"
  shaderConfig={config}
  uniforms={{ u_strength: { type: 'float', value: 0.5 } }}
  textures={{ image: image.texture, overlay: overlay.texture }}  // -> u_image (unit 0), u_overlay (unit 1)
  frameloop="demand"
/>
```

- **Sampler names.** A key `image` binds the sampler `u_image`, matching the `uniforms` convention.
  You do not declare the sampler in `createShaderConfig` — the prop appends it. If the GLSL never
  actually samples that name, registration throws (a texture bound to a dead sampler can never
  affect the picture) rather than binding nowhere.
- **`useImageTexture(input, options?)`** returns `{ texture, status, error }` where `status` is
  `'idle' | 'loading' | 'ready' | 'error'`. `input: null` is idle (render before a file is chosen).
  Swapping the input keeps the old frame on screen until the new one decodes — no flash.
  Clearing the input back to `null` stops updates and the canvas keeps the last uploaded frame;
  unmount the component or swap the `textures` record to reset it to the placeholder.
- **CORS.** URL inputs default to `crossOrigin: 'anonymous'`, because WebGL cannot accept a
  cross-origin image without CORS approval. If the server does not send permissive CORS headers the
  load fails and `status` becomes `'error'`. Pass `crossOrigin` to change the mode.
- **flipY.** Sources upload DOM-upright by default (`flipY: true`), so `texture2D(u_image, uv)` with
  a top-left `uv` shows the image the right way up. Override per texture in the options.
- **Failing loud.** A decode/CORS failure reaches `status: 'error'` and, if you passed no `onError`,
  re-throws during render so it hits your nearest error boundary. Pass `onError` to tolerate it
  (a gallery skipping a broken URL); silence is never the default.
- **Reduced motion.** A landing image calls `request()` (discrete), so it repaints a motion-gated
  poster exactly once instead of being suppressed — the picture updates, the clock stays frozen.
- **`resizeToPOT`.** Off by default (nothing silently rescales your pixels). Turn it on to draw the
  source onto a power-of-two canvas first, which legalizes `REPEAT` wrap and mipmap min-filters.
  Mipmaps are regenerated on **every** upload, so a mipmapped dynamic source pays that cost per
  frame; leave the default `LINEAR` filter for the common non-repeating case.
- **Worker mode.** `textures` under `worker` throws at mount: texture frames decode on the main
  thread and cannot cross to the worker, so it fails loud instead of sampling a blank placeholder.
  Turn worker mode off on that component, or drop `textures`.

### Video and webcam textures

`useVideoTexture` samples a playing `<video>` (a file URL, a `MediaStream`, or an element you own)
into a `sampler2D`; `useWebcamTexture` opens the camera and feeds it the same way. Both hand back
the same stable `TextureSource` the `textures` prop expects, and both pump one upload per decoded
frame — driven by the video's own clock through `requestVideoFrameCallback` (an internal
`requestAnimationFrame` loop where that is missing), so a paused tab or a `demand` engine costs
nothing between frames.

```tsx
const clip = useVideoTexture('https://example.com/clip.mp4');   // URL | MediaStream | HTMLVideoElement | null
const cam = useWebcamTexture();                                 // never auto-starts

<button onClick={() => cam.start()}>Enable camera</button>
<button onClick={cam.stop}>Disable camera</button>

<BaseShaderComponent
  programId="scene"
  shaderConfig={config}
  uniforms={{}}
  textures={{ cam: cam.texture }}                               // -> u_cam (unit 0)
  frameloop="demand"
/>
```

- **`useVideoTexture(input, options?)`** returns `{ texture, status, error, video }` with
  `status: 'idle' | 'loading' | 'ready' | 'error'`. A URL or `MediaStream` input is adopted into a
  hidden element micugl creates `muted` and `playsInline` and auto-plays (browsers only autoplay
  muted video). Pass an `HTMLVideoElement` you own and micugl **never** touches its playback — it
  only pumps and samples what you play. `crossOrigin` (default `'anonymous'`) and `loop` (default
  `false`) apply only to a hidden element micugl creates, so in practice only to URL inputs: `loop`
  is meaningless on a live `MediaStream` and is never touched on an element you own and play yourself.
- **`useWebcamTexture(options?)`** returns `{ texture, status, error, start, stop, stream }` with
  `status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'`. It is **explicit start/stop** and
  never auto-starts: opening a camera is a permission moment, so it waits for `start()`. `stop()` and
  unmount end every track, so the OS camera indicator clears. `deviceId`, `facingMode`, `width` and
  `height` pass straight through to the constraints; the constraints always set `audio: false` (there
  is no option to record audio). Changing those constraints on a live hook throws — give the
  component a `key` that changes with them so React remounts it and stops the old camera.
- **Permissions and secure context.** `getUserMedia` only exists in a secure context: serve over
  `https`, or from `localhost`. A denied or unavailable camera reaches `status: 'error'` and, with no
  `onError`, re-throws during render to your nearest error boundary — same convention as the image
  hook.
- **Reduced motion.** The first decoded frame requests a *discrete* repaint and every frame after it
  a *continuous* one, so a motion-gated scene paints one frozen poster of the opening frame and then
  stays still, instead of either animating or showing black.
- **Capture semantics.** A playing video or a running webcam is wall-clock-dependent, so
  `renderToBlob({ frame })` and `renderSequence` **throw** — a synthesized frame number cannot
  reproduce a live picture. Pause the video or `stop()` the camera first for a deterministic export.
  The live-clock paths — `renderToBlob()` with no frame, `record()`, `captureStream()` — capture the
  live picture and stay available (the "capture button on a webcam filter" case).
- **`resizeToPOT`.** Supported, and lazy: the power-of-two copy is drawn at most once per decoded
  frame, reusing one canvas until the video's dimensions change. It legalizes `REPEAT` wrap and
  mipmap min-filters, but a mipmapped video regenerates mipmaps on every upload — that is a per-frame
  cost on top of the per-frame copy, so leave the default `LINEAR` filter unless you need it.
- **SSR.** Importing the hooks touches no browser global, and `getUserMedia` / the element are read
  lazily inside `start()` / the mount effect, so the hooks render on the server and only reach for the
  camera in the browser.

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
