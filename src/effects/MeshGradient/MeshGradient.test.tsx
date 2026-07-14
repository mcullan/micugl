import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MeshGradient } from '@/effects/MeshGradient/MeshGradient';
import type { AudioUniformsResult } from '@/react';
import { useAudioUniforms } from '@/react';
import type { AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import { asContext, createFakeStream, FakeContext, latestAnalyser, LOW_HALF } from '@/react/lib/fakeWebAudio';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import { uploadsOf } from '@/testing/fixtures';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { AudioSourceSpec, Frameloop, ShaderHandle, Vec3 } from '@/types';

const WIDTH = 320;
const HEIGHT = 200;
const MIC: AudioSourceSpec = { type: 'mic' };
const FIXTURE_COLORS: Vec3[] = [[0.13, 0.71, 0.29], [0.82, 0.19, 0.57]];

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

function timeUploads(): number[] {
    return uploadsOf(stub, 'u_time') as number[];
}

interface Fixture {
    context: FakeContext;
    deps: AudioAnalyserDriverDeps;
    hear: () => void;
}

function createFixture(): Fixture {
    const context = new FakeContext();
    const { stream } = createFakeStream();
    return {
        context,
        deps: {
            createContext: () => asContext(context),
            getUserMedia: () => Promise.resolve(stream)
        },
        hear: () => { latestAnalyser(context).spectrum = LOW_HALF }
    };
}

interface AudioSceneProps {
    probe: { current: AudioUniformsResult | null };
    handleRef: { current: ShaderHandle | null };
    deps: AudioAnalyserDriverDeps;
    frameloop?: Frameloop;
}

const AudioScene = ({ probe, handleRef, deps, frameloop = 'always' }: AudioSceneProps) => {
    const audio = useAudioUniforms(MIC, { bands: 2, fftSize: 64, bandLayout: 'linear', attack: 0.05, release: 0.4 }, deps);
    probe.current = audio;

    return (
        <MeshGradient
            ref={handleRef}
            audio={audio}
            colors={FIXTURE_COLORS}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop={frameloop}
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
};

function current(probe: { current: AudioUniformsResult | null }): AudioUniformsResult {
    const value = probe.current;
    if (!value) {
        throw new Error('the scene has not rendered yet');
    }
    return value;
}

describe('MeshGradient: real uniforms reach the GL stub and advance', () => {
    it('uploads the fixture colors and drives u_time forward across ticks', async () => {
        await mount(
            <MeshGradient
                colors={FIXTURE_COLORS}
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

        const color0 = uploadsOf(stub, 'u_color0').map(value => Array.from(value as Float32Array));
        expect(color0.length).toBeGreaterThan(0);
        expect(color0[0]).toEqual(Array.from(new Float32Array([0.13, 0.71, 0.29])));

        const times = timeUploads();
        expect(times.length).toBeGreaterThan(5);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThan(times[i - 1]);
        }
        expect(times[times.length - 1]).toBeLessThan(1);
    });
});

describe('MeshGradient: audio capture liveness through the real component', () => {
    it('blocks an explicit-frame export while audio runs, and allows it once stopped', async () => {
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const handleRef: { current: ShaderHandle | null } = { current: null };
        const fixture = createFixture();

        await mount(<AudioScene probe={probe} handleRef={handleRef} deps={fixture.deps} />);
        act(() => { frames.tick(0) });

        await act(async () => { await current(probe).start() });
        fixture.hear();
        for (let time = 16; time <= 96; time += 16) {
            act(() => { frames.tick(time) });
        }

        const handle = handleRef.current;
        if (!handle) {
            throw new Error('no shader handle');
        }
        await expect(handle.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        act(() => { current(probe).stop() });
        act(() => { frames.tick(112) });

        await expect(handle.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('MeshGradient: audio invalidation drives demand-mode renders', () => {
    it('keeps the demand loop alive while audio runs and drains it when stopped', async () => {
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const handleRef: { current: ShaderHandle | null } = { current: null };
        const fixture = createFixture();

        await mount(<AudioScene probe={probe} handleRef={handleRef} deps={fixture.deps} frameloop='demand' />);
        act(() => { frames.tick(0) });
        expect(frames.pending()).toBe(0);

        await act(async () => { await current(probe).start() });
        expect(frames.pending()).toBe(1);
        fixture.hear();

        for (let time = 16; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
            expect(frames.pending()).toBe(1);
        }

        const times = timeUploads();
        expect(times.length).toBeGreaterThan(5);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThan(times[i - 1]);
        }

        act(() => { current(probe).stop() });
        act(() => { frames.tick(176) });
        expect(frames.pending()).toBe(0);

        const settled = timeUploads().length;
        act(() => { frames.tick(192) });
        expect(timeUploads().length).toBe(settled);
    });
});

const GatedAudioScene = ({ probe, deps }: { probe: { current: AudioUniformsResult | null }; deps: AudioAnalyserDriverDeps }) => {
    const audio = useAudioUniforms(MIC, { bands: 2, fftSize: 64, bandLayout: 'linear', attack: 0.05, release: 0.4 }, deps);
    probe.current = audio;

    return (
        <MeshGradient
            audio={audio}
            colors={FIXTURE_COLORS}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            saveData='ignore'
        />
    );
};

describe('MeshGradient: reduced motion gates the audio reaction into a frozen poster', () => {
    it('holds u_time and u_audioLevel still while a running mic streams', async () => {
        mockReducedMotionActive();
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const fixture = createFixture();

        await mount(<GatedAudioScene probe={probe} deps={fixture.deps} />);
        act(() => { frames.tick(0) });
        expect(uploadsOf(stub, 'u_audioLevel')).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await act(async () => { await current(probe).start() });
        expect(frames.pending()).toBe(1);
        fixture.hear();
        act(() => { frames.tick(16) });
        expect(frames.pending()).toBe(0);

        const frozenTimes = timeUploads().length;
        for (let time = 32; time <= 320; time += 16) {
            act(() => { frames.tick(time) });
            expect(frames.pending()).toBe(0);
        }

        expect((uploadsOf(stub, 'u_audioLevel') as number[]).every(value => value === 0)).toBe(true);
        expect(timeUploads().length).toBe(frozenTimes);
    });
});
