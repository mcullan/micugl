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
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { AudioSourceSpec, AudioUniformsOptions, ShaderProgramConfig } from '@/types';

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
    deps: AudioAnalyserDriverDeps;
    hear: () => void;
}

function createFixture(): Fixture {
    const context = new FakeContext();
    const { stream } = createFakeStream();
    return {
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
let stubs: GLStubHandle[];
let byCanvas: WeakMap<object, GLStubHandle>;
let originalGetContext: unknown;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stubs = [];
    byCanvas = new WeakMap<object, GLStubHandle>();
    originalGetContext = (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => WebGLRenderingContext }).getContext =
        function stubGetContext(this: object) {
            const existing = byCanvas.get(this);
            if (existing) {
                return existing.gl;
            }
            const created = createGLStub();
            byCanvas.set(this, created);
            stubs.push(created);
            return created.gl;
        };

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext;
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

function levelUploads(stub: GLStubHandle): number[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, 'u_audioLevel');
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value as number);
}

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

interface GatedSceneProps {
    probe: { current: AudioUniformsResult | null };
    deps: AudioAnalyserDriverDeps;
}

const GatedScene = ({ probe, deps }: GatedSceneProps) => {
    const audio = useAudioUniforms(MIC, optionsFor(2), deps);
    probe.current = audio;
    return (
        <BaseShaderComponent
            programId={PROGRAM_ID}
            shaderConfig={configFor(2)}
            uniforms={audio.uniforms}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            saveData='ignore'
        />
    );
};

describe('a gated audio visualizer end-to-end (relay integrity)', () => {
    it('freezes the poster while a running mic streams, then repaints a drained zero on stop', async () => {
        mockReducedMotionActive();
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<GatedScene probe={probe} deps={fixture.deps} />);
        act(() => { frames.tick(0) });
        const stub = stubs[0];
        expect(levelUploads(stub)).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await act(async () => { await current(probe).start() });
        expect(frames.pending()).toBe(1);
        fixture.hear();

        act(() => { frames.tick(16) });
        expect(frames.pending()).toBe(0);

        for (let time = 32; time <= 320; time += 16) {
            act(() => { frames.tick(time) });
            expect(frames.pending()).toBe(0);
        }
        expect(levelUploads(stub).every(value => value === 0)).toBe(true);

        act(() => { current(probe).stop() });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(336) });

        expect(levelUploads(stub).every(value => value === 0)).toBe(true);
        expect(frames.pending()).toBe(0);
    });
});

interface TwoEngineSceneProps {
    probe: { current: AudioUniformsResult | null };
    deps: AudioAnalyserDriverDeps;
}

const TwoEngineScene = ({ probe, deps }: TwoEngineSceneProps) => {
    const audio = useAudioUniforms(MIC, optionsFor(2), deps);
    probe.current = audio;
    return (
        <>
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={configFor(2)}
                uniforms={audio.uniforms}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={configFor(2)}
                uniforms={audio.uniforms}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                saveData='ignore'
            />
        </>
    );
};

describe('two engines sharing one audio driver, one gated and one not', () => {
    it('animates the ungated engine while the gated engine freezes its poster', async () => {
        mockReducedMotionActive();
        const probe = probeRef();
        const fixture = createFixture();

        await mount(<TwoEngineScene probe={probe} deps={fixture.deps} />);
        act(() => { frames.tick(0) });

        expect(stubs).toHaveLength(2);
        const animated = stubs[0];
        const gated = stubs[1];

        await act(async () => { await current(probe).start() });
        fixture.hear();

        for (let time = 16; time <= 96; time += 16) {
            act(() => { frames.tick(time) });
        }
        const gatedFrozen = levelUploads(gated).length;
        const animatedAtSettle = levelUploads(animated).length;

        for (let time = 112; time <= 400; time += 16) {
            act(() => { frames.tick(time) });
        }

        const animatedLevels = levelUploads(animated);
        expect(animatedLevels.length).toBeGreaterThan(animatedAtSettle);
        expect(animatedLevels[animatedLevels.length - 1]).toBeGreaterThan(0.4);
        for (let i = 1; i < animatedLevels.length; i++) {
            expect(animatedLevels[i]).toBeGreaterThanOrEqual(animatedLevels[i - 1]);
        }

        expect(levelUploads(gated).length).toBe(gatedFrozen);
    });
});
