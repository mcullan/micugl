import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { Frameloop, ShaderHandle, UniformParam } from '@/types';
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

interface FrameQueue {
    schedule: (callback: (now: number) => void) => number;
    cancel: (handle: number) => void;
    pending: () => number;
    tick: (now: number) => void;
}

function createFrameQueue(): FrameQueue {
    const scheduled = new Map<number, (now: number) => void>();
    let nextHandle = 1;

    return {
        schedule: callback => {
            const handle = nextHandle;
            nextHandle += 1;
            scheduled.set(handle, callback);
            return handle;
        },
        cancel: handle => { scheduled.delete(handle) },
        pending: () => scheduled.size,
        tick: now => {
            const callbacks = Array.from(scheduled.values());
            scheduled.clear();
            callbacks.forEach(callback => { callback(now) });
        }
    };
}

interface WorkerHarness {
    createWorker: () => Worker;
    gl: GLStubHandle;
    frames: FrameQueue;
    errors: string[];
    uploads: (name: string) => unknown[];
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
});
