import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { UniformParam } from '@/types';
import type { MainToWorker, WorkerToMain } from '@/worker/protocol';
import type { WorkerRuntimeHost } from '@/worker/WorkerRuntime';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

const PROGRAM_ID = 'blob';
const WIDTH = 320;
const HEIGHT = 200;
const LIVE_VALUE = 0.75;

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_level: 'float' }
});

interface WorkerHarness {
    createWorker: () => Worker;
    gl: GLStubHandle;
    frames: FrameQueue;
    posted: MainToWorker[];
}

function createWorkerHarness(): WorkerHarness {
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
    const posted: MainToWorker[] = [];
    const listeners: ((event: MessageEvent<WorkerToMain>) => void)[] = [];

    const host: WorkerRuntimeHost = {
        postMessage: message => {
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
            runtime.handleMessage(message);
        },
        addEventListener: (type: string, listener: (event: never) => void) => {
            if (type === 'error') return;
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
        offscreenCanvas.width = this.width;
        offscreenCanvas.height = this.height;
        return offscreen;
    };
    (HTMLCanvasElement.prototype as unknown as {
        getContext: () => WebGLRenderingContext;
    }).getContext = function getContext() {
        return stub.gl;
    };

    return {
        createWorker: () => worker as unknown as Worker,
        gl: stub,
        frames,
        posted
    };
}

let container: HTMLDivElement;
let root: Root;
let mainFrames: FrameQueue;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mainFrames = createFrameQueue();
    globalThis.requestAnimationFrame = mainFrames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = mainFrames.cancel;

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
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

interface SceneProps {
    worker: WorkerHarness;
    uniforms: Record<string, UniformParam>;
    liveUniforms: string[];
}

const Scene = ({ worker, uniforms, liveUniforms }: SceneProps) => (
    <BaseShaderComponent
        worker={true}
        createWorker={worker.createWorker}
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        uniforms={uniforms}
        liveUniforms={liveUniforms}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop='demand'
        saveData='ignore'
    />
);

function firstIndexOf(posted: MainToWorker[], predicate: (message: MainToWorker) => boolean): number {
    return posted.findIndex(predicate);
}

describe('a gated worker mount posts its poster renderFrame after the first live values', () => {
    it('posts renderFrame only after setMotionGate and the setUniformValues carrying the live sample', async () => {
        mockReducedMotionActive();
        const worker = createWorkerHarness();

        await mount(
            <Scene
                worker={worker}
                uniforms={{ level: { type: 'float', value: () => LIVE_VALUE } }}
                liveUniforms={['level']}
            />
        );

        const gateIndex = firstIndexOf(worker.posted, message => message.type === 'setMotionGate');
        const liveValuesIndex = firstIndexOf(
            worker.posted,
            message => message.type === 'setUniformValues' && message.values.u_level === LIVE_VALUE
        );
        const renderFrameIndex = firstIndexOf(worker.posted, message => message.type === 'renderFrame');

        expect(gateIndex).toBeGreaterThanOrEqual(0);
        expect(liveValuesIndex).toBeGreaterThanOrEqual(0);
        expect(renderFrameIndex).toBeGreaterThanOrEqual(0);

        const gate = worker.posted[gateIndex];
        if (gate.type !== 'setMotionGate') {
            throw new Error('expected a setMotionGate message at gateIndex');
        }
        expect(gate.gate).toBe('static');

        expect(renderFrameIndex).toBeGreaterThan(liveValuesIndex);
        expect(renderFrameIndex).toBeGreaterThan(gateIndex);
    });
});
