import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import type { ShaderNode } from '@/core/lib/graphPlanning';
import { shaderNode } from '@/core/lib/graphPlanning';
import { blurNode } from '@/effects/Blur/blurNode';
import { grainNode } from '@/effects/Grain/grainNode';
import { meshGradientNode } from '@/effects/MeshGradient/meshGradientNode';
import { ShaderGraph } from '@/react/components/ShaderGraph';
import type { EngineHandle, GraphDebugPort } from '@/react/devtools/beacon';
import { listEngines } from '@/react/devtools/beacon';
import type { AudioUniformsResult } from '@/react/hooks/useAudioUniforms';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import { bitmap, createSource } from '@/testing/fixtures';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { PingPongShaderHandle } from '@/types';

const WIDTH = 320;
const HEIGHT = 200;

const COMPOSITE_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}'
});

const NAMES_OF_INTEREST = [
    'u_time',
    'u_resolution',
    'u_direction',
    'u_radius',
    'u_speed',
    'u_audioLevel',
    'u_src'
];

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub();

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
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
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

function uploads(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function count(name: string): number {
    return stub.calls.filter(call => call.name === name).length;
}

function currentHandle(): EngineHandle {
    const handle = listEngines().at(-1);
    if (!handle) {
        throw new Error('no engine mounted');
    }
    return handle;
}

function currentGraph(): GraphDebugPort {
    const graph = currentHandle().graph;
    if (!graph) {
        throw new Error('the mounted engine exposes no graph debug port');
    }
    return graph;
}

describe('effects composition: the blur is one program run twice with per-pass direction (T3)', () => {
    it('links one program and uploads [1,0] then [0,1] every frame in pass order', async () => {
        const image = createSource('img');
        image.push(bitmap(64, 32));

        await mount(
            <ShaderGraph
                root={blurNode({ id: 'blur', src: image.source, radius: 6 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        expect(count('linkProgram')).toBe(1);

        const times: number[] = [];
        for (const now of [16, 32, 48]) {
            stub.reset();
            act(() => { frames.tick(now) });

            const segments = passSegments();
            expect(segments).toHaveLength(2);
            expect(Array.from(valueIn(segments[0], 'u_direction') as Float32Array)).toEqual([1, 0]);
            expect(Array.from(valueIn(segments[1], 'u_direction') as Float32Array)).toEqual([0, 1]);
            expect(valueIn(segments[0], 'u_radius')).toBe(6);
            times.push(valueIn(segments[1], 'u_time') as number);
        }

        expect(times[0]).toBeLessThan(times[1]);
        expect(times[1]).toBeLessThan(times[2]);
        expect(times[times.length - 1]).toBeLessThan(1);
    });
});

function twoGrainGraph(): ShaderNode {
    const g1 = grainNode({ id: 'g1', speed: 1, width: 16, height: 8 });
    const g2 = grainNode({ id: 'g2', speed: 3, width: 32, height: 4 });
    return shaderNode({
        id: 'root',
        shaderConfig: COMPOSITE_CONFIG,
        uniforms: { a: g1, b: g2 }
    });
}

describe('effects composition: two grain nodes dedup but keep distinct per-pass values (T8)', () => {
    it('links two programs for three nodes and uploads both speeds in one frame', async () => {
        await mount(
            <ShaderGraph
                root={twoGrainGraph()}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        expect(count('linkProgram')).toBe(2);

        stub.reset();
        act(() => { frames.tick(16) });

        const speeds = uploads('u_speed') as number[];
        expect(speeds).toContain(1);
        expect(speeds).toContain(3);

        const resolutions = uploads('u_resolution').map(value => Array.from(value as Float32Array));
        expect(resolutions).toContainEqual([16, 8]);
        expect(resolutions).toContainEqual([32, 4]);
    });
});

describe('effects composition: a mesh gradient node mounts and advances (T8b)', () => {
    it('uploads its first color and drives u_time forward in seconds', async () => {
        await mount(
            <ShaderGraph
                root={meshGradientNode({
                    id: 'mesh',
                    speed: 0.5,
                    colors: [[0.09, 0.61, 0.37], [0.88, 0.24, 0.66]]
                })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        for (let time = 0; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
        }

        const color0 = uploads('u_color0').map(value => Array.from(value as Float32Array));
        expect(color0[0]).toEqual(Array.from(new Float32Array([0.09, 0.61, 0.37])));

        const times = uploads('u_time') as number[];
        expect(times.length).toBeGreaterThan(5);
        expect(times[times.length - 1]).toBeLessThan(1);
    });
});

function fakeAudio(invalidation: ReturnType<typeof createFrameInvalidation>, running: () => boolean): AudioUniformsResult {
    return {
        uniforms: {
            u_audioLevel: {
                type: 'float',
                value: (time?: number) => (time ?? 0) / 1000,
                invalidation,
                nonReproducible: running
            }
        },
        start: () => Promise.resolve(),
        stop: () => undefined,
        status: 'running',
        error: null
    };
}

describe('effects composition: an audio-driven grain node under demand (T9)', () => {
    it('advances u_audioLevel via the relay and blocks a reproducible capture only while running', async () => {
        let running = true;
        const live = createFrameInvalidation();
        const handleRef: { current: PingPongShaderHandle | null } = { current: null };

        await mount(
            <ShaderGraph
                ref={handleRef}
                root={grainNode({ id: 'grain', audio: fakeAudio(live, () => running) })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        for (const now of [16, 32, 48]) {
            act(() => { live.request('discrete') });
            expect(frames.pending()).toBe(1);
            act(() => { frames.tick(now) });
        }

        const levels = uploads('u_audioLevel') as number[];
        expect(levels).toEqual([0, 0.016, 0.032, 0.048]);

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        running = false;
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('effects composition: the debug port keys off node id under a shared program (T10)', () => {
    it('lists one entry per node with each node own direction, addressable by node id', async () => {
        const image = createSource('img');
        image.push(bitmap(64, 32));

        await mount(
            <ShaderGraph
                root={blurNode({ id: 'blur', src: image.source, radius: 6 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });

        const graph = currentGraph();
        const topoIds = graph.topology().nodes.map(node => node.id).sort();
        expect(topoIds).toEqual(['blur', 'blur-x']);

        const xDirection = graph.nodeUniforms('blur-x').list().find(entry => entry.name === 'u_direction');
        const yDirection = graph.nodeUniforms('blur').list().find(entry => entry.name === 'u_direction');
        expect(Array.from(xDirection?.value as Float32Array)).toEqual([1, 0]);
        expect(Array.from(yDirection?.value as Float32Array)).toEqual([0, 1]);

        const combined = currentHandle().uniforms?.list() ?? [];
        const directionOwners = combined
            .filter(entry => entry.name === 'u_direction')
            .map(entry => [entry.nodeId, Array.from(entry.value as Float32Array)]);
        expect(directionOwners).toEqual([
            ['blur-x', [1, 0]],
            ['blur', [0, 1]]
        ]);

        expect(() => graph.readNode('blur-x')).not.toThrow();
        expect(() => graph.readNode('blur')).not.toThrow();
    });
});

describe('effects composition: capture resolves on a shared-program graph (T11)', () => {
    it('renders a no-frame blob through the shared blur program', async () => {
        const image = createSource('img');
        image.push(bitmap(64, 32));
        const handleRef: { current: PingPongShaderHandle | null } = { current: null };

        await mount(
            <ShaderGraph
                ref={handleRef}
                root={blurNode({ id: 'blur', src: image.source, radius: 6 })}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });

        await expect(handleRef.current?.renderToBlob()).resolves.toBeInstanceOf(Blob);
    });
});
