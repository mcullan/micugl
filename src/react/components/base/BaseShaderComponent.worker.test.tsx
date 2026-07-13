import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
import type {
    AudioSourceSpec,
    AudioUniformsOptions,
    Frameloop,
    ShaderHandle,
    UniformParam
} from '@/types';
import type { MainToWorker, WorkerToMain } from '@/worker/protocol';
import type { WorkerRuntimeHost } from '@/worker/WorkerRuntime';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

const PROGRAM_ID = 'blob';
const WIDTH = 320;
const HEIGHT = 200;

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_level: 'float' }
});

const AUDIO_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_audioBands: 'vec2', u_audioLevel: 'float' }
});

const MIC: AudioSourceSpec = { type: 'mic' };

const AUDIO_OPTIONS: AudioUniformsOptions = {
    bands: 2,
    fftSize: 64,
    bandLayout: 'linear',
    attack: 0.05,
    release: 0.4
};

interface WorkerHarness {
    createWorker: () => Worker;
    gl: GLStubHandle;
    frames: FrameQueue;
    errors: string[];
    uploads: (name: string) => unknown[];
    posted: MainToWorker[];
    transfers: () => number;
    mainThreadContexts: () => number;
    failToStart: () => void;
    crash: (message: string) => void;
}

interface WorkerHarnessOptions {
    startsScript?: boolean;
}

function createWorkerHarness({ startsScript = true }: WorkerHarnessOptions = {}): WorkerHarness {
    const offscreenCanvas = {
        width: 0,
        height: 0,
        getContext: (): WebGLRenderingContext => stub.gl,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined
    };
    const offscreen = offscreenCanvas as unknown as OffscreenCanvas;
    const stub = createGLStub({ overrides: { canvas: offscreen } });

    const frames = createFrameQueue();
    const errors: string[] = [];
    const posted: MainToWorker[] = [];
    const listeners: ((event: MessageEvent<WorkerToMain>) => void)[] = [];
    const errorListeners: ((event: Event) => void)[] = [];

    let transferCount = 0;
    let mainThreadContextCount = 0;

    const host: WorkerRuntimeHost = {
        postMessage: message => {
            if (message.type === 'error') {
                errors.push(message.message);
            }
            listeners.forEach(listener => { listener({ data: message } as MessageEvent<WorkerToMain>) });
        },
        requestAnimationFrame: frames.schedule,
        cancelAnimationFrame: frames.cancel,
        now: () => 0
    };

    const runtime = new WorkerRuntime(host);

    const worker = {
        postMessage: (message: MainToWorker) => {
            posted.push(message);
            if (startsScript) {
                runtime.handleMessage(message);
            }
        },
        addEventListener: (type: string, listener: (event: never) => void) => {
            if (type === 'error') {
                errorListeners.push(listener as (event: Event) => void);
                return;
            }
            listeners.push(listener as (event: MessageEvent<WorkerToMain>) => void);
        },
        removeEventListener: () => undefined,
        terminate: () => undefined
    };

    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = {};
    (globalThis as { Worker?: unknown }).Worker = {};
    (HTMLCanvasElement.prototype as unknown as {
        transferControlToOffscreen: () => OffscreenCanvas;
    }).transferControlToOffscreen = function transferControlToOffscreen(this: HTMLCanvasElement) {
        transferCount += 1;
        offscreenCanvas.width = this.width;
        offscreenCanvas.height = this.height;
        return offscreen;
    };
    (HTMLCanvasElement.prototype as unknown as {
        getContext: () => WebGLRenderingContext;
    }).getContext = function getContext() {
        mainThreadContextCount += 1;
        return stub.gl;
    };

    return {
        createWorker: () => worker as unknown as Worker,
        gl: stub,
        frames,
        errors,
        posted,
        uploads: name => {
            const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
            return stub.uniformCalls
                .filter(call => call.location === location)
                .map(call => call.value);
        },
        transfers: () => transferCount,
        mainThreadContexts: () => mainThreadContextCount,
        failToStart: () => {
            errorListeners.forEach(listener => { listener(new Event('error')) });
        },
        crash: (message: string) => {
            errorListeners.forEach(listener => { listener(new ErrorEvent('error', { message })) });
        }
    };
}

let container: HTMLDivElement;
let root: Root;
let mainFrames: FrameQueue;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mainFrames = createFrameQueue();
    globalThis.requestAnimationFrame = mainFrames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = mainFrames.cancel;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
});

interface SceneProps {
    worker: WorkerHarness;
    handleRef: { current: ShaderHandle | null };
    uniforms: Record<string, UniformParam>;
    liveUniforms?: string[];
    frameloop: Frameloop;
}

const Scene = ({ worker, handleRef, uniforms, liveUniforms, frameloop }: SceneProps) => (
    <BaseShaderComponent
        ref={handleRef}
        worker={true}
        createWorker={worker.createWorker}
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        uniforms={uniforms}
        liveUniforms={liveUniforms}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop={frameloop}
        reducedMotion='ignore'
        saveData='ignore'
    />
);

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

interface AudioFixture {
    context: FakeContext;
    deps: AudioAnalyserDriverDeps;
    hear: () => void;
}

function createAudioFixture(): AudioFixture {
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

function countedUniforms(
    uniforms: Record<string, UniformParam>,
    samples: string[]
): Record<string, UniformParam> {
    const counted: Record<string, UniformParam> = {};
    for (const [name, param] of Object.entries(uniforms)) {
        const value = param.value;
        counted[name] = typeof value === 'function'
            ? {
                ...param,
                value: (time, width, height) => {
                    samples.push(name);
                    return value(time, width, height);
                }
            }
            : param;
    }
    return counted;
}

interface AudioSceneProps {
    worker: WorkerHarness;
    audio: AudioFixture;
    probe: { current: AudioUniformsResult | null };
    frameloop: Frameloop;
    samples?: string[];
}

const AudioScene = ({ worker, audio, probe, frameloop, samples }: AudioSceneProps) => {
    const result = useAudioUniforms(MIC, AUDIO_OPTIONS, audio.deps);
    probe.current = result;

    return (
        <BaseShaderComponent
            worker={true}
            createWorker={worker.createWorker}
            programId={PROGRAM_ID}
            shaderConfig={AUDIO_CONFIG}
            uniforms={samples ? countedUniforms(result.uniforms, samples) : result.uniforms}
            liveUniforms={['u_audioBands', 'u_audioLevel']}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop={frameloop}
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
};

function currentAudio(probe: { current: AudioUniformsResult | null }): AudioUniformsResult {
    const value = probe.current;
    if (!value) {
        throw new Error('the audio scene has not rendered yet');
    }
    return value;
}

function latestBandsUpload(worker: WorkerHarness): number[] {
    const calls = worker.uploads('u_audioBands');
    if (calls.length === 0) {
        throw new Error('u_audioBands has never been uploaded to the worker');
    }
    return Array.from(calls[calls.length - 1] as Float32Array);
}

function bandsPosts(worker: WorkerHarness): number {
    return worker.posted.filter(
        message => message.type === 'setUniformValues' && 'u_audioBands' in message.values
    ).length;
}

interface BandFrame {
    posts: number;
    uploaded: number[];
}

function expectAdvancingBands(series: BandFrame[]): void {
    expect(series.length).toBeGreaterThan(5);
    expect(series.every(frame => frame.uploaded.length === 2)).toBe(true);
    expect(series.every(frame => frame.uploaded.every(value => Number.isFinite(value)))).toBe(true);

    for (let i = 1; i < series.length; i++) {
        expect(series[i].posts).toBeGreaterThan(series[i - 1].posts);
        expect(series[i].uploaded[0]).toBeGreaterThan(series[i - 1].uploaded[0]);
    }
    expect(series[series.length - 1].uploaded[0]).toBeGreaterThan(0.4);
}

function sampleBands(worker: WorkerHarness): BandFrame {
    return { posts: bandsPosts(worker), uploaded: latestBandsUpload(worker) };
}

describe('BaseShaderComponent in worker mode', () => {
    it('throws once, in render, for a liveUniforms name that is not a uniform', async () => {
        const worker = createWorkerHarness();
        const handleRef = { current: null as ShaderHandle | null };

        await expect(mount(
            <Scene
                worker={worker}
                handleRef={handleRef}
                uniforms={{ level: { type: 'float', value: 0.5 } }}
                liveUniforms={['ghost']}
                frameloop='always'
            />
        )).rejects.toThrow(/u_ghost/);

        expect(worker.frames.pending()).toBe(0);
        expect(mainFrames.pending()).toBe(0);
    });

    it('throws once, in render, for a uniform with a "transition", instead of silently ignoring it', async () => {
        const worker = createWorkerHarness();
        const handleRef = { current: null as ShaderHandle | null };

        await expect(mount(
            <Scene
                worker={worker}
                handleRef={handleRef}
                uniforms={{ level: { type: 'float', value: 0, transition: { duration: 300 } } }}
                frameloop='always'
            />
        )).rejects.toThrow(/u_level/);

        expect(worker.frames.pending()).toBe(0);
        expect(mainFrames.pending()).toBe(0);
    });

    it('samples and posts the live uniform on invalidate(), so a demand frame is not drawn with a stale value',
        async () => {
            const worker = createWorkerHarness();
            const handleRef = { current: null as ShaderHandle | null };
            const level = { current: 0 };

            await mount(
                <Scene
                    worker={worker}
                    handleRef={handleRef}
                    uniforms={{ level: { type: 'float', value: () => level.current } }}
                    liveUniforms={['level']}
                    frameloop='demand'
                />
            );

            worker.frames.tick(0);
            expect(worker.errors).toEqual([]);
            expect(worker.uploads('u_level')).toEqual([0]);

            level.current = 0.75;
            await act(async () => {
                handleRef.current?.invalidate();
                await Promise.resolve();
            });

            expect(mainFrames.pending()).toBe(1);

            worker.frames.tick(16);

            expect(worker.errors).toEqual([]);
            expect(worker.uploads('u_level')).toEqual([0, 0.75]);
        });

    it('falls back to a fresh main-thread canvas when the worker never starts its script', async () => {
        const worker = createWorkerHarness({ startsScript: false });
        const handleRef = { current: null as ShaderHandle | null };

        await mount(
            <Scene
                worker={worker}
                handleRef={handleRef}
                uniforms={{ level: { type: 'float', value: 0.5 } }}
                frameloop='always'
            />
        );

        const transferred = container.querySelector('canvas');
        expect(worker.transfers()).toBe(1);
        expect(worker.mainThreadContexts()).toBe(0);
        expect(mainFrames.pending()).toBe(0);

        await act(async () => {
            worker.failToStart();
            await Promise.resolve();
        });

        const replacement = container.querySelector('canvas');
        expect(replacement).not.toBe(transferred);
        expect(worker.transfers()).toBe(1);
        expect(worker.mainThreadContexts()).toBe(1);

        act(() => { mainFrames.tick(16) });

        expect(worker.errors).toEqual([]);
        expect(worker.uploads('u_level')).toEqual([0.5]);
    });

    it('surfaces an uncaught worker error instead of blaming a CSP and falling back to the main thread',
        async () => {
            const worker = createWorkerHarness({ startsScript: false });
            const handleRef = { current: null as ShaderHandle | null };

            await mount(
                <Scene
                    worker={worker}
                    handleRef={handleRef}
                    uniforms={{ level: { type: 'float', value: 0.5 } }}
                    frameloop='always'
                />
            );

            let failure: Error | null = null;
            try {
                await act(async () => {
                    worker.crash('u_level is not a function');
                    await Promise.resolve();
                });
            } catch (error) {
                failure = error as Error;
            }

            expect(failure?.message).toContain('u_level is not a function');
            expect(failure?.message).toContain('createWorker() factory');
            expect(failure?.message).not.toContain('Content-Security-Policy');
            expect(failure?.message).not.toContain('Rendering on the main thread');
            expect(worker.mainThreadContexts()).toBe(0);
            expect(worker.transfers()).toBe(1);
        });

    it('starts the sampler loop when liveUniforms is switched on after the worker connected', async () => {
        const worker = createWorkerHarness();
        const handleRef = { current: null as ShaderHandle | null };
        const level = { current: 0.75 };

        await mount(
            <Scene
                worker={worker}
                handleRef={handleRef}
                uniforms={{ level: { type: 'float', value: 0 } }}
                frameloop='always'
            />
        );

        worker.frames.tick(0);
        expect(worker.uploads('u_level')).toEqual([0]);
        expect(mainFrames.pending()).toBe(0);

        await mount(
            <Scene
                worker={worker}
                handleRef={handleRef}
                uniforms={{ level: { type: 'float', value: () => level.current } }}
                liveUniforms={['level']}
                frameloop='always'
            />
        );

        expect(mainFrames.pending()).toBe(1);
        act(() => { mainFrames.tick(16) });
        worker.frames.tick(16);

        expect(worker.errors).toEqual([]);
        expect(worker.uploads('u_level')).toEqual([0, 0.75]);
    });

    it('frameloop="demand": an audio uniform keeps posting advancing values instead of freezing after one frame',
        async () => {
            const worker = createWorkerHarness();
            const audio = createAudioFixture();
            const probe = { current: null as AudioUniformsResult | null };

            await mount(<AudioScene worker={worker} audio={audio} probe={probe} frameloop='demand' />);

            act(() => { mainFrames.tick(0) });
            worker.frames.tick(0);
            expect(worker.uploads('u_audioLevel')).toEqual([0]);
            expect(mainFrames.pending()).toBe(0);

            await act(async () => { await currentAudio(probe).start() });
            expect(mainFrames.pending()).toBe(1);

            audio.hear();

            const bandSeries: BandFrame[] = [];
            for (let time = 16; time <= 160; time += 16) {
                await act(async () => {
                    mainFrames.tick(time);
                    await Promise.resolve();
                });
                expect(mainFrames.pending()).toBe(1);
                worker.frames.tick(time);
                bandSeries.push(sampleBands(worker));
            }

            const levels = worker.uploads('u_audioLevel') as number[];
            expect(worker.errors).toEqual([]);
            expect(levels.length).toBeGreaterThan(5);
            for (let i = 1; i < levels.length; i++) {
                expect(levels[i]).toBeGreaterThan(levels[i - 1]);
            }
            expect(levels[levels.length - 1]).toBeGreaterThan(0.4);
            expect(levels.every(level => Number.isFinite(level))).toBe(true);

            expectAdvancingBands(bandSeries);

            await act(async () => {
                currentAudio(probe).stop();
                await Promise.resolve();
            });
            await act(async () => {
                mainFrames.tick(176);
                await Promise.resolve();
            });
            worker.frames.tick(176);

            const after = worker.uploads('u_audioLevel') as number[];
            expect(after[after.length - 1]).toBe(0);
            expect(mainFrames.pending()).toBe(0);
        });

    it('samples each live uniform once per frame: waking the loop from inside the sampler must not re-enter it',
        async () => {
            const worker = createWorkerHarness();
            const audio = createAudioFixture();
            const probe = { current: null as AudioUniformsResult | null };
            const samples: string[] = [];

            await mount(
                <AudioScene worker={worker} audio={audio} probe={probe} frameloop='demand' samples={samples} />
            );
            act(() => { mainFrames.tick(0) });

            await act(async () => { await currentAudio(probe).start() });
            audio.hear();

            const analyser = latestAnalyser(audio.context);
            const readsBefore = analyser.reads;
            samples.length = 0;

            const bandSeries: BandFrame[] = [];
            for (let time = 16; time <= 112; time += 16) {
                await act(async () => {
                    mainFrames.tick(time);
                    await Promise.resolve();
                });
                worker.frames.tick(time);
                bandSeries.push(sampleBands(worker));
            }

            expect(samples.filter(name => name === 'u_audioLevel')).toHaveLength(7);
            expect(samples.filter(name => name === 'u_audioBands')).toHaveLength(7);
            expect(analyser.reads - readsBefore).toBe(7);

            expectAdvancingBands(bandSeries);
        });

    it('never posts an invalidate ahead of the setUniformValues it is for: the worker cannot redraw stale uniforms',
        async () => {
            const worker = createWorkerHarness();
            const audio = createAudioFixture();
            const probe = { current: null as AudioUniformsResult | null };

            await mount(<AudioScene worker={worker} audio={audio} probe={probe} frameloop='demand' />);
            act(() => { mainFrames.tick(0) });

            await act(async () => { await currentAudio(probe).start() });
            audio.hear();

            worker.posted.length = 0;

            for (let time = 16; time <= 96; time += 16) {
                await act(async () => {
                    mainFrames.tick(time);
                    await Promise.resolve();
                });
                worker.frames.tick(time);
            }

            const order = worker.posted
                .map(message => message.type)
                .filter(type => type === 'setUniformValues' || type === 'invalidate');

            expect(order.filter(type => type === 'setUniformValues').length).toBeGreaterThan(4);
            expect(order.filter(type => type === 'invalidate').length).toBeGreaterThan(4);
            expect(order[0]).toBe('setUniformValues');

            let posts = 0;
            let redraws = 0;
            for (const type of order) {
                if (type === 'setUniformValues') {
                    posts += 1;
                    continue;
                }
                redraws += 1;
                expect(redraws).toBeLessThanOrEqual(posts);
            }
        });
});
