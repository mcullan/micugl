import { act, type ReactElement, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFrameInvalidation, type FrameInvalidation } from '@/core/lib/frameInvalidation';
import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { Ripple } from '@/effects/Ripple/Ripple';
import type { AudioUniformsResult } from '@/react';
import { listEngines } from '@/react/devtools/beacon';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import { uploadsOf } from '@/testing/fixtures';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { PingPongShaderHandle } from '@/types';

const WIDTH = 64;
const HEIGHT = 32;

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

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub({
        extensions: { OES_texture_float: true, OES_texture_float_linear: true },
        renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
    });

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

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

function drawCount(): number {
    return stub.calls.filter(call => call.name === 'drawArrays').length;
}

function callCount(name: string): number {
    return stub.calls.filter(call => call.name === name).length;
}

interface Upload {
    name: string;
    value: unknown;
}

const SEGMENT_NAMES = ['u_time', 'u_resolution', 'u_damping', 'u_color1', 'u_mouseForce', 'u_autoDrip'];

function locationsByName(): Map<unknown, string> {
    const byLocation = new Map<unknown, string>();
    for (const name of SEGMENT_NAMES) {
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

function value(segment: Upload[], name: string): unknown {
    return segment.find(upload => upload.name === name)?.value;
}

function fakeAudio(invalidation: FrameInvalidation, running: () => boolean): AudioUniformsResult {
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

describe('Ripple: the feedback accumulator flips isTimePure and blocks an explicit-frame capture (T2)', () => {
    it('rejects renderToBlob({ frame }) with the accumulating-simulation message', async () => {
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };
        await mount(
            <Ripple
                ref={handleRef}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );
        act(() => { frames.tick(0) });
        act(() => { frames.tick(16) });

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/accumulating simulation/);
        expect(stub.readPixelsCalls.length).toBe(0);
    });
});

describe('Ripple: built-in units ride through the feedback path (T4)', () => {
    it('uploads u_time as seconds to both the sim and render programs, and passes a function uniform raw', async () => {
        await mount(
            <Ripple
                mouseForce={0.5}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='always'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        for (let time = 0; time <= 96; time += 16) {
            act(() => { frames.tick(time) });
        }

        act(() => { document.dispatchEvent(new MouseEvent('mousedown')) });
        for (let time = 112; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
        }

        const segments = passSegments();
        const simSegments = segments.filter(segment => value(segment, 'u_damping') !== undefined);
        const renderSegments = segments.filter(segment => value(segment, 'u_color1') !== undefined);
        expect(simSegments.length).toBeGreaterThan(0);
        expect(renderSegments.length).toBeGreaterThan(0);

        for (const segment of simSegments) {
            const time = value(segment, 'u_time') as number;
            expect(time).toBeLessThan(1);
        }
        for (const segment of renderSegments) {
            const time = value(segment, 'u_time') as number;
            expect(time).toBeLessThan(1);
        }

        const times = uploadsOf(stub, 'u_time') as number[];
        expect(times.length).toBeGreaterThan(5);
        expect(times[times.length - 1]).toBeLessThan(1);
        expect(times.some(t => t > 0)).toBe(true);

        const resolution = uploadsOf(stub, 'u_resolution').map(v => Array.from(v as Float32Array));
        expect(resolution).toContainEqual([WIDTH, HEIGHT]);

        const forces = uploadsOf(stub, 'u_mouseForce') as number[];
        expect(forces).toContain(0.5);
    });
});

describe('Ripple: a seed + steps capture is deterministic (T5)', () => {
    it('resolves twice with identical call counts and resets both feedback textures', async () => {
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };
        await mount(
            <Ripple
                ref={handleRef}
                iterations={1}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );
        act(() => { frames.tick(0) });

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ seed: { kind: 'clear', color: [0, 0, 0, 0] }, steps: 5 }))
            .resolves.toBeInstanceOf(Blob);
        const runOne = { draws: drawCount(), clears: callCount('clearColor'), reads: stub.readPixelsCalls.length };

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ seed: { kind: 'clear', color: [0, 0, 0, 0] }, steps: 5 }))
            .resolves.toBeInstanceOf(Blob);
        const runTwo = { draws: drawCount(), clears: callCount('clearColor'), reads: stub.readPixelsCalls.length };

        expect(runTwo).toEqual(runOne);
        expect(runOne.reads).toBe(1);
        expect(runOne.clears).toBe(7);
    });
});

describe('Ripple: reduced motion gates the loop, and interaction still advances it (T6)', () => {
    it('steps once per discrete invalidation, suppresses continuous, and a pointer event schedules a step', async () => {
        mockReducedMotionActive();
        const live = createFrameInvalidation();
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };

        await mount(
            <Ripple
                ref={handleRef}
                iterations={1}
                audio={fakeAudio(live, () => false)}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                saveData='ignore'
            />
        );
        act(() => { frames.tick(0) });
        expect(frames.pending()).toBe(0);

        for (const now of [16, 32, 48]) {
            stub.reset();
            act(() => { handleRef.current?.invalidate() });
            expect(frames.pending()).toBe(1);
            act(() => { frames.tick(now) });
            expect(drawCount()).toBe(2);
        }

        act(() => { live.request('continuous') });
        expect(frames.pending()).toBe(0);

        stub.reset();
        act(() => { document.dispatchEvent(new MouseEvent('mousedown')) });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(64) });
        expect(drawCount()).toBe(2);
    });
});

describe('Ripple: u_autoDrip is a real gate, not an accidental one (T7)', () => {
    it('uploads u_autoDrip = 1 with the loop running and no gate', async () => {
        await mount(
            <Ripple
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='always'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );
        for (let time = 0; time <= 48; time += 16) {
            act(() => { frames.tick(time) });
        }
        const drips = uploadsOf(stub, 'u_autoDrip') as number[];
        expect(drips.length).toBeGreaterThan(0);
        expect(drips.every(value => value === 1)).toBe(true);
    });

    it('uploads u_autoDrip = 0 under a reduced-motion gate', async () => {
        mockReducedMotionActive();
        await mount(
            <Ripple
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                saveData='ignore'
            />
        );
        act(() => { frames.tick(0) });
        const drips = uploadsOf(stub, 'u_autoDrip') as number[];
        expect(drips.length).toBeGreaterThan(0);
        expect(drips.every(value => value === 0)).toBe(true);
    });
});

describe('Ripple: a live audio input rides through and blocks a reproducible capture (T8)', () => {
    it('advances u_audioLevel via the relay and orders the audio guard before the accumulator guard', async () => {
        let running = true;
        const live = createFrameInvalidation();
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };

        await mount(
            <Ripple
                ref={handleRef}
                iterations={1}
                audio={fakeAudio(live, () => running)}
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

        const levels = uploadsOf(stub, 'u_audioLevel') as number[];
        expect(levels).toEqual([0, 0.016, 0.032, 0.048]);

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        running = false;
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/accumulating simulation/);

        stub.reset();
        await expect(handleRef.current?.renderToBlob()).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);
    });
});

describe('Ripple: prop validation throws on the public mount path before an engine registers (T9)', () => {
    it('rejects a mount with damping = 0 and leaves no engine registered', async () => {
        const before = listEngines().length;
        await expect(mount(
            <Ripple
                damping={0}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/damping/);
        expect(listEngines().length).toBe(before);
    });
});

describe('Ripple: iterations below 1 throws on the public mount path before an engine registers (T10)', () => {
    it('rejects a mount with iterations = 0 and leaves no engine registered', async () => {
        const before = listEngines().length;
        await expect(mount(
            <Ripple
                iterations={0}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/iterations must be at least 1/);
        expect(listEngines().length).toBe(before);
    });
});
