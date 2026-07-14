import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BandCount } from '@/core/lib/audioBands';
import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { AudioUniformsResult } from '@/react/hooks/useAudioUniforms';
import { useAudioUniforms } from '@/react/hooks/useAudioUniforms';
import type { AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import { asContext, createFakeStream, FakeContext, latestAnalyser, LOW_HALF } from '@/react/lib/fakeWebAudio';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import { uploadsOf } from '@/testing/fixtures';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { AudioSourceSpec, AudioUniformsOptions, Frameloop, ShaderProgramConfig } from '@/types';

const PROGRAM_ID = 'audio-bars';
const WIDTH = 320;
const HEIGHT = 200;

const MIC: AudioSourceSpec = { type: 'mic' };

const BAND_TYPES = { 1: 'float', 2: 'vec2', 3: 'vec3', 4: 'vec4' } as const;

const configFor = (bands: BandCount): ShaderProgramConfig => createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_audioBands: BAND_TYPES[bands], u_audioLevel: 'float' }
});

const optionsFor = (bands: BandCount): AudioUniformsOptions => ({
    bands,
    fftSize: 64,
    bandLayout: 'linear',
    attack: 0.05,
    release: 0.4
});

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

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub();
    originalGetContext = (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => WebGLRenderingContext }).getContext =
        function stubGetContext() { return stub.gl };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext;
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

function levelUploads(): number[] {
    return uploadsOf(stub, 'u_audioLevel') as number[];
}

function latestBands(): number[] {
    const calls = uploadsOf(stub, 'u_audioBands');
    if (calls.length === 0) {
        throw new Error('u_audioBands has never been uploaded');
    }
    return Array.from(calls[calls.length - 1] as Float32Array);
}

interface SceneProps {
    probe: { current: AudioUniformsResult | null };
    deps: AudioAnalyserDriverDeps;
    bands: BandCount;
    frameloop?: Frameloop;
}

const Scene = ({ probe, deps, bands, frameloop = 'always' }: SceneProps) => {
    const audio = useAudioUniforms(MIC, optionsFor(bands), deps);
    probe.current = audio;

    return (
        <BaseShaderComponent
            programId={PROGRAM_ID}
            shaderConfig={configFor(bands)}
            uniforms={audio.uniforms}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop={frameloop}
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
};

function probeRef(): { current: AudioUniformsResult | null } {
    return { current: null };
}

function current(probe: { current: AudioUniformsResult | null }): AudioUniformsResult {
    const value = probe.current;
    if (!value) {
        throw new Error('the scene has not rendered yet');
    }
    return value;
}

describe('audio uniforms reaching GL through a mounted BaseShaderComponent (real driver, fake analyser)', () => {
    it('uploads a level that advances every frame once the analyser hears something', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<Scene probe={probe} deps={fixture.deps} bands={2} />);
        frames.tick(0);
        expect(levelUploads()).toEqual([0]);

        await act(async () => { await current(probe).start() });
        fixture.hear();

        for (let time = 16; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
        }

        const levels = levelUploads();
        expect(levels.length).toBeGreaterThan(5);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]).toBeGreaterThan(levels[i - 1]);
        }
        expect(levels[levels.length - 1]).toBeGreaterThan(0.4);
        expect(levels.every(level => Number.isFinite(level))).toBe(true);
        expect(latestBands()).toHaveLength(2);
    });

    it('frameloop="demand": start() wakes the loop, each analysed frame arms the next, and stop() drains it', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<Scene probe={probe} deps={fixture.deps} bands={2} frameloop='demand' />);
        act(() => { frames.tick(0) });
        expect(levelUploads()).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await act(async () => { await current(probe).start() });
        expect(frames.pending()).toBe(1);

        fixture.hear();

        for (let time = 16; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
            expect(frames.pending()).toBe(1);
        }

        const levels = levelUploads();
        expect(levels.length).toBeGreaterThan(5);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]).toBeGreaterThan(levels[i - 1]);
        }
        expect(levels[levels.length - 1]).toBeGreaterThan(0.4);

        act(() => { current(probe).stop() });
        expect(frames.pending()).toBe(1);

        act(() => { frames.tick(176) });

        expect(levelUploads()[levelUploads().length - 1]).toBe(0);
        expect(latestBands()).toEqual([0, 0]);
        expect(frames.pending()).toBe(0);

        act(() => { frames.tick(192) });
        expect(frames.pending()).toBe(0);
    });

    it('widening the bands 1 -> 4 uploads a full vec4, never a short buffer padded with NaN', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<Scene probe={probe} deps={fixture.deps} bands={1} />);
        act(() => { frames.tick(0) });

        await act(async () => { await current(probe).start() });
        fixture.hear();

        for (let time = 16; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
        }
        expect(uploadsOf(stub, 'u_audioBands').every(value => Number.isFinite(value))).toBe(true);

        await mount(<Scene probe={probe} deps={fixture.deps} bands={4} />);
        fixture.hear();

        const series: number[][] = [];
        for (let time = 176; time <= 336; time += 16) {
            act(() => { frames.tick(time) });
            series.push(latestBands());
        }

        expect(series.every(bands => bands.length === 4)).toBe(true);
        expect(series.every(bands => bands.every(value => Number.isFinite(value)))).toBe(true);
        for (let i = 1; i < series.length; i++) {
            expect(series[i][0]).toBeGreaterThan(series[i - 1][0]);
        }
        expect(series[series.length - 1][0]).toBeGreaterThan(0.8);
    });

    it('a bands change uploads the reallocated vector, still advancing and never NaN', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<Scene probe={probe} deps={fixture.deps} bands={4} />);
        act(() => { frames.tick(0) });

        await act(async () => { await current(probe).start() });
        fixture.hear();

        for (let time = 16; time <= 320; time += 16) {
            act(() => { frames.tick(time) });
        }
        expect(latestBands()).toHaveLength(4);
        expect(latestBands()[0]).toBeGreaterThan(0.8);

        await mount(<Scene probe={probe} deps={fixture.deps} bands={2} />);
        fixture.hear();

        const series: number[][] = [];
        for (let time = 336; time <= 496; time += 16) {
            act(() => { frames.tick(time) });
            series.push(latestBands());
        }

        expect(series.every(bands => bands.length === 2)).toBe(true);
        expect(series.every(bands => bands.every(value => Number.isFinite(value)))).toBe(true);
        expect(series[0][0]).toBeLessThan(0.3);
        for (let i = 1; i < series.length; i++) {
            expect(series[i][0]).toBeGreaterThan(series[i - 1][0]);
        }
        expect(series[series.length - 1][0]).toBeGreaterThan(0.8);
    });
});
