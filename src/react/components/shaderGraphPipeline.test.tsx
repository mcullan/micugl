import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import type { FrameInvalidation, InvalidationKind } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import type { ShaderNode } from '@/core/lib/graphPlanning';
import { shaderNode } from '@/core/lib/graphPlanning';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { BasePingPongShaderComponent } from '@/react/components/base/BasePingPongShaderComponent';
import { PingPongShaderEngine } from '@/react/components/engine/PingPongShaderEngine';
import { ShaderGraph } from '@/react/components/ShaderGraph';
import { listEngines } from '@/react/devtools/beacon';
import { useShaderGraph } from '@/react/hooks/useShaderGraph';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type {
    PingPongShaderHandle,
    RenderPass,
    TextureSource,
    TextureUploadSource,
    UniformParam
} from '@/types';

const WIDTH = 320;
const HEIGHT = 200;

const GEN_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_gain: 'float' }
});

const ROOT_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_mix: 'float' }
});

const TINT_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_shade: 'float' }
});

const PING_PONG_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_swirl: 'float' }
});

const NAMES_OF_INTEREST = ['u_time', 'u_resolution', 'u_gain', 'u_mix', 'u_shade', 'u_tex', 'u_img'];

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;
let originalMatchMedia: typeof window.matchMedia | undefined;

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

function installStub(config: GLStubConfig = {}): void {
    stub = createGLStub(config);
}

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    installStub();

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    originalGetContext = canvasProto.getContext;
    originalToBlob = canvasProto.toBlob;
    canvasProto.getContext = function stubGetContext(type: string): unknown {
        return type === '2d' ? { putImageData: () => undefined, drawImage: () => undefined } : stub.gl;
    };
    canvasProto.toBlob = function stubToBlob(callback: (blob: Blob) => void, type?: string): void {
        callback(new Blob([], { type: type ?? 'image/png' }));
    };

    (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;
    delete (globalThis as { ImageData?: unknown }).ImageData;
    if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
    }
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

function mockReducedMotionActive(): void {
    window.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
}

interface Upload {
    name: string;
    value: unknown;
}

function locationsByName(): Map<unknown, string> {
    const byLocation = new Map<unknown, string>();
    for (const name of NAMES_OF_INTEREST) {
        const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
        if (location) {
            byLocation.set(location, name);
        }
    }
    return byLocation;
}

function passSegments(): Upload[][] {
    const byLocation = locationsByName();
    const segments: Upload[][] = [];
    let current: Upload[] = [];

    for (const call of stub.calls) {
        if (call.name === 'drawArrays') {
            segments.push(current);
            current = [];
            continue;
        }
        if (!call.name.startsWith('uniform')) {
            continue;
        }
        const name = byLocation.get(call.args[0]);
        if (name === undefined) {
            continue;
        }
        current.push({ name, value: call.args[call.args.length - 1] });
    }

    return segments;
}

function valueIn(segment: Upload[], name: string): unknown {
    const found = segment.find(upload => upload.name === name);
    if (!found) {
        throw new Error(`no upload of "${name}" in this pass`);
    }
    return found.value;
}

function hasUpload(segment: Upload[], name: string): boolean {
    return segment.some(upload => upload.name === name);
}

function uploads(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function count(name: string): number {
    return stub.calls.filter(call => call.name === name).length;
}

function sourceUploads(): { width: number; height: number }[] {
    return stub.texImage2DCalls
        .filter(call => call.source !== undefined)
        .map(call => ({ width: call.width, height: call.height }));
}

interface FakeSource {
    source: TextureSource;
    produceFrame: (width?: number, height?: number, kind?: InvalidationKind) => void;
    setLive: (live: boolean) => void;
}

function createFakeSource(id: string): FakeSource {
    const invalidation = createFrameInvalidation();
    let frame: TextureUploadSource | null = null;
    let version = 0;
    let live = false;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(),
        getFrame: () => frame,
        invalidation,
        nonReproducible: () => live
    };

    return {
        source,
        produceFrame: (width = 640, height = 480, kind: InvalidationKind = 'discrete') => {
            frame = { videoWidth: width, videoHeight: height } as unknown as TextureUploadSource;
            version += 1;
            invalidation.request(kind);
        },
        setLive: (next: boolean) => { live = next }
    };
}

interface CountingInvalidation {
    invalidation: FrameInvalidation;
    listeners: () => number;
}

function createCountingInvalidation(): CountingInvalidation {
    const inner = createFrameInvalidation();
    let listeners = 0;

    return {
        invalidation: {
            connect: invalidate => {
                listeners += 1;
                const dispose = inner.connect(invalidate);
                return () => {
                    listeners -= 1;
                    dispose();
                };
            },
            request: kind => { inner.request(kind) }
        },
        listeners: () => listeners
    };
}

function twoNodeGraph(gain: UniformParam, mix: UniformParam): ShaderNode {
    const gen = shaderNode({
        id: 'gen',
        shaderConfig: GEN_CONFIG,
        uniforms: { gain },
        width: 16,
        height: 8
    });
    return shaderNode({
        id: 'root',
        shaderConfig: ROOT_CONFIG,
        uniforms: { tex: gen, mix }
    });
}

function currentPort(): UniformDebugPort {
    const engines = listEngines();
    const port = engines[engines.length - 1]?.uniforms;
    if (!port) {
        throw new Error('the mounted engine exposes no uniform debug port');
    }
    return port;
}

describe('ShaderGraph: two nodes, one frame (T6)', () => {
    it('draws the child then the root, and advances each node own u_time across three ticks', async () => {
        await mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });

        const genTimes: number[] = [];
        const rootTimes: number[] = [];

        for (const now of [16, 32, 48]) {
            stub.reset();
            act(() => { frames.tick(now) });

            const segments = passSegments();
            expect(segments).toHaveLength(2);

            expect(valueIn(segments[0], 'u_gain')).toBe(0.375);
            expect(hasUpload(segments[0], 'u_mix')).toBe(false);
            expect(valueIn(segments[1], 'u_mix')).toBe(0.875);
            expect(hasUpload(segments[1], 'u_gain')).toBe(false);

            genTimes.push(valueIn(segments[0], 'u_time') as number);
            rootTimes.push(valueIn(segments[1], 'u_time') as number);
        }

        expect(genTimes[0]).toBeLessThan(genTimes[1]);
        expect(genTimes[1]).toBeLessThan(genTimes[2]);
        expect(rootTimes).toEqual(genTimes);
    });
});

describe('ShaderGraph: u_time reaches a graph node in seconds (T7)', () => {
    it('uploads a u_time well under 1 after 160 ms of ticks, on both nodes', async () => {
        await mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        for (let i = 1; i <= 10; i++) {
            act(() => { frames.tick(16 * i) });
        }

        stub.reset();
        act(() => { frames.tick(160) });

        const segments = passSegments();
        expect(segments).toHaveLength(2);
        expect(valueIn(segments[0], 'u_time')).toBeCloseTo(0.16, 5);
        expect(valueIn(segments[1], 'u_time')).toBeCloseTo(0.16, 5);
    });
});

describe('ShaderGraph: u_resolution is the node own output size (T8)', () => {
    it('gives a 16x8 node its own dims while the root sees the canvas, in the same frame', async () => {
        await mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        stub.reset();
        act(() => { frames.tick(16) });

        const segments = passSegments();
        expect(Array.from(valueIn(segments[0], 'u_resolution') as Float32Array)).toEqual([16, 8]);
        expect(Array.from(valueIn(segments[1], 'u_resolution') as Float32Array)).toEqual([WIDTH, HEIGHT]);
    });
});

describe('ShaderGraph: a uniform value change does not re-init (T9)', () => {
    it('keeps the passes array identity across a value change, through the real hook', async () => {
        const seen: RenderPass[][] = [];

        const Probe = ({ mix }: { mix: number }) => {
            const result = useShaderGraph(
                twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: mix })
            );
            seen.push(result.passes);
            return null;
        };

        await mount(<Probe mix={0.25} />);
        await mount(<Probe mix={0.875} />);

        expect(seen.length).toBeGreaterThanOrEqual(2);
        expect(seen[seen.length - 1]).toBe(seen[0]);
    });

    it('schedules no re-init frame in demand mode when only a value changes', async () => {
        const scene = (mix: number): ReactElement => (
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: mix })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(0.25));
        act(() => { frames.tick(0) });
        expect(count('drawArrays')).toBe(2);
        expect(frames.pending()).toBe(0);

        await mount(scene(0.875));

        expect(frames.pending()).toBe(0);
        expect(count('createProgram')).toBe(2);
    });

    it('still lands the new value on GL on the next frame, so the stable array is live', async () => {
        const scene = (mix: number): ReactElement => (
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: mix })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(0.25));
        act(() => { frames.tick(0) });
        expect(uploads('u_mix')).toEqual([0.25]);

        await mount(scene(0.875));
        const drawsBefore = count('drawArrays');
        act(() => { frames.tick(16) });

        expect(count('drawArrays')).toBe(drawsBefore + 2);
        expect(uploads('u_mix')).toEqual([0.25, 0.875]);
    });
});

describe('ShaderGraph: adding a node re-inits (T10)', () => {
    it('creates a fresh program and a fresh framebuffer, and the new node uniform reaches GL', async () => {
        const gen = shaderNode({
            id: 'gen',
            shaderConfig: GEN_CONFIG,
            uniforms: { gain: { type: 'float', value: 0.375 } },
            width: 16,
            height: 8
        });
        const tint = shaderNode({
            id: 'tint',
            shaderConfig: TINT_CONFIG,
            uniforms: { shade: { type: 'float', value: 0.125 } },
            width: 4,
            height: 4
        });

        const scene = (withTint: boolean): ReactElement => (
            <ShaderGraph
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: withTint
                        ? { tex: gen, tint, mix: { type: 'float', value: 0.875 } }
                        : { tex: gen, mix: { type: 'float', value: 0.875 } }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(false));
        act(() => { frames.tick(0) });
        expect(count('createProgram')).toBe(2);
        const framebuffersBefore = count('createFramebuffer');
        expect(uploads('u_shade')).toEqual([]);

        await mount(scene(true));
        act(() => { frames.tick(16) });

        expect(count('createProgram')).toBe(2 + 3);
        expect(count('createFramebuffer')).toBeGreaterThan(framebuffersBefore);
        expect(uploads('u_shade')).toEqual([0.125]);
    });
});

describe('ShaderGraph: a tween transition on a node uniform (T11)', () => {
    it('animates the child node uniform through intermediate values before landing on the target', async () => {
        const scene = (gain: number): ReactElement => (
            <ShaderGraph
                root={twoNodeGraph(
                    { type: 'float', value: gain, transition: { duration: 100, easing: 'linear' } },
                    { type: 'float', value: 0.875 }
                )}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(0));
        act(() => { frames.tick(0) });
        expect(uploads('u_gain')).toEqual([0]);

        await mount(scene(1));
        for (const now of [20, 40, 60, 80]) {
            act(() => { frames.tick(now) });
        }

        const animated = uploads('u_gain').slice(1) as number[];
        for (let i = 1; i < animated.length; i++) {
            expect(animated[i]).toBeGreaterThan(animated[i - 1]);
        }
        const strictlyBetween = animated.filter(value => value > 0 && value < 1);
        expect(strictlyBetween.length).toBeGreaterThanOrEqual(2);

        act(() => { frames.tick(200) });
        const settled = uploads('u_gain') as number[];
        expect(settled[settled.length - 1]).toBe(1);
    });
});

describe('ShaderGraph: an audio-shaped node uniform blocks a reproducible capture (T12)', () => {
    it('reports the audio blocker while the predicate is true and captures once it is false', async () => {
        let live = true;
        const handleRef: { current: PingPongShaderHandle | null } = { current: null };
        const gain: UniformParam = {
            type: 'float',
            value: 0.375,
            nonReproducible: () => live
        };

        await mount(
            <ShaderGraph
                ref={handleRef}
                root={twoNodeGraph(gain, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );
        act(() => { frames.tick(0) });

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        live = false;
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('ShaderGraph: a texture-source leaf on a node (T13)', () => {
    it('defines it, uploads it once, binds it at the node unit, and does not re-upload on an unchanged version', async () => {
        const image = createFakeSource('img');
        const gen = shaderNode({
            id: 'gen',
            shaderConfig: GEN_CONFIG,
            uniforms: { gain: { type: 'float', value: 0.375 }, img: image.source },
            width: 16,
            height: 8
        });

        await mount(
            <ShaderGraph
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: { tex: gen, mix: { type: 'float', value: 0.875 } }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        expect(sourceUploads()).toEqual([]);

        image.produceFrame(64, 32);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(sourceUploads()).toEqual([{ width: 64, height: 32 }]);

        const segments = passSegments();
        const genSegment = segments.find(segment => hasUpload(segment, 'u_gain'));
        expect(genSegment).toBeDefined();
        expect(valueIn(genSegment ?? [], 'u_img')).toBe(0);

        const drawsAfterUpload = count('drawArrays');
        image.source.invalidation.request('discrete');
        act(() => { frames.tick(32) });

        expect(count('drawArrays')).toBe(drawsAfterUpload + 2);
        expect(sourceUploads()).toEqual([{ width: 64, height: 32 }]);
        expect(stub.texSubImage2DCalls).toHaveLength(0);
    });
});

describe('ShaderGraph: capture liveness composes across nodes and sources (T14)', () => {
    it('reports spring first, then a live source, and captures once both are settled', async () => {
        const video = createFakeSource('clip');
        const handleRef: { current: PingPongShaderHandle | null } = { current: null };

        const scene = (gain: number): ReactElement => (
            <ShaderGraph
                ref={handleRef}
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: {
                        tex: shaderNode({
                            id: 'gen',
                            shaderConfig: GEN_CONFIG,
                            uniforms: {
                                gain: {
                                    type: 'float',
                                    value: gain,
                                    transition: { type: 'spring', stiffness: 1200, damping: 20 }
                                },
                                img: video.source
                            },
                            width: 16,
                            height: 8
                        }),
                        mix: { type: 'float', value: 0.875 }
                    }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(0));
        act(() => { frames.tick(0) });
        video.produceFrame(64, 32);
        act(() => { frames.tick(16) });

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);

        await mount(scene(1));
        act(() => { frames.tick(32) });
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/spring transition/);

        video.setLive(true);
        for (let i = 3; i < 200 && frames.pending() > 0; i++) {
            act(() => { frames.tick(16 * i) });
        }
        expect(frames.pending()).toBe(0);
        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/live video or webcam texture/);

        video.setLive(false);
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('ShaderGraph: the invalidation kind survives the graph fan-in (T15)', () => {
    it('suppresses a continuous source and a continuous node uniform under a static gate, but repaints on a discrete one', async () => {
        mockReducedMotionActive();

        const webcam = createFakeSource('cam');
        const live = createFrameInvalidation();
        const gain: UniformParam = { type: 'float', value: 0.375, invalidation: live };

        const gen = shaderNode({
            id: 'gen',
            shaderConfig: GEN_CONFIG,
            uniforms: { gain, img: webcam.source },
            width: 16,
            height: 8
        });

        await mount(
            <ShaderGraph
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: { tex: gen, mix: { type: 'float', value: 0.875 } }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        const poster = count('drawArrays');
        expect(poster).toBe(2);

        for (let i = 1; i <= 10; i++) {
            act(() => { webcam.produceFrame(64, 32, 'continuous') });
            expect(frames.pending()).toBe(0);
            act(() => { live.request('continuous') });
            expect(frames.pending()).toBe(0);
            act(() => { frames.tick(16 * i) });
        }

        expect(count('drawArrays')).toBe(poster);

        act(() => { live.request('discrete') });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(200) });

        expect(count('drawArrays')).toBe(poster + 2);
    });
});

describe('ShaderGraph: a live node uniform under demand (T16)', () => {
    it('advances a function-valued uniform across the frames its own invalidation wakes', async () => {
        const live = createFrameInvalidation();
        const gain: UniformParam = {
            type: 'float',
            value: (time?: number) => time ?? 0,
            invalidation: live
        };

        await mount(
            <ShaderGraph
                root={twoNodeGraph(gain, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        expect(uploads('u_gain')).toEqual([0]);

        for (const now of [16, 32, 48]) {
            act(() => { live.request('discrete') });
            expect(frames.pending()).toBe(1);
            act(() => { frames.tick(now) });
        }

        expect(uploads('u_gain')).toEqual([0, 16, 32, 48]);
    });
});

describe('ShaderGraph: a dead graph edge fails loud (T17)', () => {
    it('throws at init when the shader never samples the child node sampler, naming the program and the sampler', async () => {
        installStub({
            activeUniforms: {
                u_time: 'float',
                u_resolution: 'vec2',
                u_gain: 'float',
                u_mix: 'float'
            }
        });

        await expect(mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/never samples "u_tex"[\s\S]*/);
    });

    it('names the root program in that message', async () => {
        installStub({
            activeUniforms: {
                u_time: 'float',
                u_resolution: 'vec2',
                u_gain: 'float',
                u_mix: 'float'
            }
        });

        await expect(mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/program "root"/);
    });

    it('still throws for a source leaf whose sampler the shader never samples', async () => {
        installStub({
            activeUniforms: {
                u_time: 'float',
                u_resolution: 'vec2',
                u_gain: 'float',
                u_mix: 'float',
                u_tex: 'sampler2D'
            }
        });

        const image = createFakeSource('img');
        const gen = shaderNode({
            id: 'gen',
            shaderConfig: GEN_CONFIG,
            uniforms: { gain: { type: 'float', value: 0.375 }, img: image.source },
            width: 16,
            height: 8
        });

        await expect(mount(
            <ShaderGraph
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: { tex: gen, mix: { type: 'float', value: 0.875 } }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/never samples "u_img"/);
    });

    it('keeps the null-sampler skip for a hand-authored ping-pong read binding, which still renders', async () => {
        installStub({
            extensions: { OES_texture_float: true, OES_texture_float_linear: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT],
            activeUniforms: {
                u_time: 'float',
                u_resolution: 'vec2',
                u_swirl: 'float'
            }
        });

        await mount(
            <BasePingPongShaderComponent
                programId='sim'
                shaderConfig={PING_PONG_CONFIG}
                uniforms={{ swirl: { type: 'float', value: 0.5 } }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });

        expect(count('drawArrays')).toBeGreaterThan(0);
        expect(uploads('u_swirl')).toContain(0.5);
    });
});

describe('ShaderGraph: removing a node disposes its uniform runtime (T18)', () => {
    it('disconnects the relay the removed node held on its param invalidation, and stops repainting for it', async () => {
        const counting = createCountingInvalidation();
        const gen = shaderNode({
            id: 'gen',
            shaderConfig: GEN_CONFIG,
            uniforms: { gain: { type: 'float', value: 0.375 } },
            width: 16,
            height: 8
        });
        const tint = shaderNode({
            id: 'tint',
            shaderConfig: TINT_CONFIG,
            uniforms: {
                shade: { type: 'float', value: 0.125, invalidation: counting.invalidation }
            },
            width: 4,
            height: 4
        });

        const scene = (withTint: boolean): ReactElement => (
            <ShaderGraph
                root={shaderNode({
                    id: 'root',
                    shaderConfig: ROOT_CONFIG,
                    uniforms: withTint
                        ? { tex: gen, tint, mix: { type: 'float', value: 0.875 } }
                        : { tex: gen, mix: { type: 'float', value: 0.875 } }
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(scene(true));
        act(() => { frames.tick(0) });
        expect(counting.listeners()).toBe(1);

        await mount(scene(false));
        act(() => { frames.tick(16) });

        expect(counting.listeners()).toBe(0);

        const draws = count('drawArrays');
        act(() => { counting.invalidation.request('discrete') });
        expect(frames.pending()).toBe(0);
        expect(count('drawArrays')).toBe(draws);
    });
});

describe('PingPongShaderEngine: graph texture sources under worker mode (T19)', () => {
    it('fails loud at mount instead of shipping a graph whose sources cannot cross to the worker', async () => {
        const image = createFakeSource('img');
        const passes: RenderPass[] = [{
            programId: 'root',
            inputTextures: [],
            outputFramebuffer: null
        }];

        await expect(mount(
            <PingPongShaderEngine
                worker={true}
                createWorker={() => ({}) as Worker}
                workerUniforms={{ root: {} }}
                workerCustomPasses={false}
                programConfigs={{ root: ROOT_CONFIG }}
                passes={passes}
                textureSources={[image.source]}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
            />
        )).rejects.toThrow(/texture sources are not supported in worker mode/);
    });
});

describe('ShaderGraph: the combined debug port (T20)', () => {
    it('lists both nodes uniforms and an override on one node changes what that node uploads', async () => {
        await mount(
            <ShaderGraph
                root={twoNodeGraph({ type: 'float', value: 0.375 }, { type: 'float', value: 0.875 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });

        const port = currentPort();
        expect(port.list().map(entry => entry.name)).toEqual(['u_gain', 'u_mix']);
        expect(uploads('u_mix')).toEqual([0.875]);

        act(() => { port.setOverride('u_mix', 0.125) });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(uploads('u_mix')).toEqual([0.875, 0.125]);
        expect(uploads('u_gain')).toEqual([0.375, 0.375]);
    });
});
