import { describe, expect, it } from 'vitest';

import { vec3 } from '@/core';
import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import {
    buildLiveUpdaters,
    collectLiveValues,
    parseUniformStructureKey,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import {
    buildPasses,
    DEFAULT_FRAMEBUFFER_OPTIONS,
    DEFAULT_RENDER_OPTIONS
} from '@/react/lib/pingPongPasses';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import { normalizeWorkerPrograms, stripPassUniforms, workerPingPongUniforms } from '@/react/lib/workerMode';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createCanvasStub, createGLStub } from '@/testing';
import type { FramebufferOptions, RenderPass, UniformParam, UniformUpdaterDef } from '@/types';
import type { MainToWorker, WorkerToMain } from '@/worker/protocol';
import type { WorkerBridgeMessageEvent, WorkerTransport } from '@/worker/WorkerBridge';
import { WorkerBridge } from '@/worker/WorkerBridge';
import type { WorkerRuntimeHost } from '@/worker/WorkerRuntime';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

const PROGRAM_ID = 'sim';
const WIDTH = 320;
const HEIGHT = 200;

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_intensity: 'float', u_color1: 'vec3', u_texture0: 'sampler2D' }
});

const UNIFORM_NAMES = ['u_time', 'u_resolution', 'u_intensity', 'u_color1', 'u_texture0'];

const GL_STUB_CONFIG: GLStubConfig = {
    extensions: { OES_texture_float: true, OES_texture_float_linear: true },
    renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
};

function simUniforms(): Record<string, UniformParam> {
    return {
        intensity: { type: 'float', value: 0.5 },
        color1: { type: 'vec3', value: vec3([1, 0, 0]) }
    };
}

function realUpdaters(
    programId: string,
    uniforms: Record<string, UniformParam>
): Record<string, UniformUpdaterDef[]> {
    const parsed = parseUniformStructureKey(uniformStructureKey(uniformDescriptors(uniforms), false));
    const valuesRef = { current: collectLiveValues(uniforms) };
    const runtime = createTransitionRuntime(() => false);
    return { [programId]: buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime) };
}

function realPingPong(uniforms: Record<string, UniformParam>): {
    passes: RenderPass[];
    framebuffers: Record<string, FramebufferOptions>;
} {
    return buildPasses(
        PROGRAM_ID,
        undefined,
        1,
        realUpdaters(PROGRAM_ID, uniforms),
        {},
        DEFAULT_FRAMEBUFFER_OPTIONS,
        DEFAULT_RENDER_OPTIONS,
        undefined
    );
}

function readable(value: unknown): unknown {
    if (value instanceof Float32Array) {
        return Array.from(value);
    }
    if (Array.isArray(value)) {
        return Array.from(value as unknown[]);
    }
    return value;
}

function uniformStateAtEachDraw(handle: GLStubHandle): Record<string, unknown>[] {
    const names = new Map<unknown, string>();
    for (const name of UNIFORM_NAMES) {
        names.set(handle.gl.getUniformLocation({} as WebGLProgram, name), name);
    }

    const draws: Record<string, unknown>[] = [];
    const state: Record<string, unknown> = {};

    for (const call of handle.calls) {
        if (call.name === 'drawArrays') {
            draws.push({ ...state });
            continue;
        }
        if (!call.name.startsWith('uniform')) {
            continue;
        }
        const [location, value] = call.args;
        const name = names.get(location);
        if (name !== undefined) {
            state[name] = readable(value);
        }
    }

    return draws;
}

function renderOnMainThread(
    passes: RenderPass[],
    framebuffers: Record<string, FramebufferOptions>,
    times: number[]
): GLStubHandle {
    const stub = createCanvasStub(GL_STUB_CONFIG);
    const manager = new WebGLManager(stub.canvas);
    manager.createProgram(PROGRAM_ID, CONFIG);

    for (const [id, options] of Object.entries(framebuffers)) {
        manager.fbo.createFramebuffer(id, options);
    }

    const passSystem = new Passes(manager);
    for (const pass of passes) {
        passSystem.addPass(pass);
    }
    passSystem.initializeResources();

    manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);
    for (const [id, options] of Object.entries(framebuffers)) {
        manager.fbo.resizeFramebuffer(id, options.width || WIDTH, options.height || HEIGHT);
    }

    stub.reset();
    for (const time of times) {
        passSystem.execute(time);
    }

    return stub;
}

interface WorkerHarness {
    gl: GLStubHandle;
    tick: (now: number) => void;
    errors: string[];
}

function renderInWorker(
    passes: RenderPass[],
    framebuffers: Record<string, FramebufferOptions>,
    uniforms: Record<string, UniformParam>,
    times: number[]
): WorkerHarness {
    const canvas = {
        width: WIDTH,
        height: HEIGHT,
        getContext: (): WebGLRenderingContext => stub.gl,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined
    };
    const offscreen = canvas as unknown as OffscreenCanvas;
    const stub = createGLStub({ ...GL_STUB_CONFIG, overrides: { canvas: offscreen } });

    const scheduled = new Map<number, (now: number) => void>();
    let nextHandle = 1;
    const errors: string[] = [];
    const listeners: ((event: WorkerBridgeMessageEvent<WorkerToMain>) => void)[] = [];

    const host: WorkerRuntimeHost = {
        postMessage: message => { listeners.forEach(listener => { listener({ data: message }) }) },
        requestAnimationFrame: callback => {
            const handle = nextHandle;
            nextHandle += 1;
            scheduled.set(handle, callback);
            return handle;
        },
        cancelAnimationFrame: handle => { scheduled.delete(handle) },
        now: () => 0
    };

    const runtime = new WorkerRuntime(host);
    const transport: WorkerTransport = {
        postMessage: (message: MainToWorker) => { runtime.handleMessage(message) },
        addEventListener: (_type, listener) => { listeners.push(listener) }
    };

    const bridge = new WorkerBridge(
        transport,
        {
            canvas: offscreen,
            kind: 'pingpong',
            programConfigs: { [PROGRAM_ID]: CONFIG },
            uniforms: normalizeWorkerPrograms(workerPingPongUniforms({
                programId: PROGRAM_ID,
                uniforms,
                customPasses: false
            })),
            passes: stripPassUniforms(passes),
            framebuffers,
            skipDefaultUniforms: false,
            frameloop: 'always',
            speed: 1,
            active: true
        },
        { onError: message => { errors.push(message) } }
    );

    expect(bridge).toBeDefined();
    stub.reset();

    const tick = (now: number): void => {
        const callbacks = Array.from(scheduled.values());
        scheduled.clear();
        callbacks.forEach(callback => { callback(now) });
    };

    for (const time of times) {
        tick(time);
    }

    return { gl: stub, tick, errors };
}

describe('worker ping-pong pipeline, driven by the real pass and uniform builders', () => {
    it('uploads the user uniform value the main thread would have uploaded, not a default', () => {
        const uniforms = simUniforms();
        const { passes, framebuffers } = realPingPong(uniforms);

        const worker = renderInWorker(passes, framebuffers, uniforms, [0]);

        expect(worker.errors).toEqual([]);
        expect(uniformStateAtEachDraw(worker.gl)[0]).toEqual({
            u_time: 0,
            u_resolution: [WIDTH, HEIGHT],
            u_intensity: 0.5,
            u_color1: [1, 0, 0]
        });
    });

    it('advances u_time in the worker instead of freezing it at the value of the first frame', () => {
        const uniforms = simUniforms();
        const { passes, framebuffers } = realPingPong(uniforms);

        const worker = renderInWorker(passes, framebuffers, uniforms, [1000, 2000, 4000]);

        expect(worker.errors).toEqual([]);
        expect(uniformStateAtEachDraw(worker.gl).map(draw => draw.u_time))
            .toEqual([0, 0, 0, 1, 1, 1, 3, 3, 3]);
    });

    it('gives the seed pass the same uniforms as every other pass, on both threads', () => {
        const uniforms = simUniforms();
        const { passes, framebuffers } = realPingPong(uniforms);

        const main = uniformStateAtEachDraw(renderOnMainThread(passes, framebuffers, [0]));
        const worker = uniformStateAtEachDraw(renderInWorker(passes, framebuffers, uniforms, [0]).gl);

        expect(main).toHaveLength(3);
        expect(main[0]).toEqual({
            u_time: 0,
            u_resolution: [WIDTH, HEIGHT],
            u_intensity: 0.5,
            u_color1: [1, 0, 0]
        });
        expect(main.slice(1).map(draw => draw.u_texture0)).toEqual([0, 0]);
        expect(worker).toEqual(main);
    });

    it('keeps worker and main thread in step as the clock advances', () => {
        const uniforms = simUniforms();
        const built = realPingPong(uniforms);

        const main = uniformStateAtEachDraw(renderOnMainThread(built.passes, built.framebuffers, [0, 1000, 2000]));
        const worker = uniformStateAtEachDraw(
            renderInWorker(built.passes, built.framebuffers, uniforms, [0, 1000, 2000]).gl
        );

        expect(worker).toEqual(main);
    });
});

interface SingleWorkerHarness {
    bridge: WorkerBridge;
    gl: GLStubHandle;
    tick: (now: number) => void;
    pending: () => number;
    errors: string[];
}

function createSingleWorker(uniforms: Record<string, UniformParam>): SingleWorkerHarness {
    const canvas = {
        width: WIDTH,
        height: HEIGHT,
        getContext: (): WebGLRenderingContext => stub.gl,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined
    };
    const offscreen = canvas as unknown as OffscreenCanvas;
    const stub = createGLStub({ ...GL_STUB_CONFIG, overrides: { canvas: offscreen } });

    const scheduled = new Map<number, (now: number) => void>();
    let nextHandle = 1;
    const errors: string[] = [];
    const listeners: ((event: WorkerBridgeMessageEvent<WorkerToMain>) => void)[] = [];

    const host: WorkerRuntimeHost = {
        postMessage: message => { listeners.forEach(listener => { listener({ data: message }) }) },
        requestAnimationFrame: callback => {
            const handle = nextHandle;
            nextHandle += 1;
            scheduled.set(handle, callback);
            return handle;
        },
        cancelAnimationFrame: handle => { scheduled.delete(handle) },
        now: () => 0
    };

    const runtime = new WorkerRuntime(host);
    const transport: WorkerTransport = {
        postMessage: (message: MainToWorker) => { runtime.handleMessage(message) },
        addEventListener: (_type, listener) => { listeners.push(listener) }
    };

    const bridge = new WorkerBridge(
        transport,
        {
            canvas: offscreen,
            kind: 'single',
            programConfigs: { [PROGRAM_ID]: CONFIG },
            uniforms: normalizeWorkerPrograms({ [PROGRAM_ID]: uniforms }),
            skipDefaultUniforms: false,
            frameloop: 'always',
            speed: 1,
            active: true
        },
        { onError: message => { errors.push(message) } }
    );

    const tick = (now: number): void => {
        const callbacks = Array.from(scheduled.values());
        scheduled.clear();
        callbacks.forEach(callback => { callback(now) });
    };

    stub.reset();
    return { bridge, gl: stub, tick, pending: () => scheduled.size, errors };
}

describe('a motion-gated single-mode worker', () => {
    it('a continuous invalidate under a static gate draws nothing', async () => {
        const worker = createSingleWorker(simUniforms());

        worker.bridge.setMotionGate('static');
        worker.tick(0);
        worker.gl.reset();

        worker.bridge.invalidate(undefined, 'continuous');
        await Promise.resolve();
        expect(worker.pending()).toBe(0);
        worker.tick(16);

        expect(worker.errors).toEqual([]);
        expect(uniformStateAtEachDraw(worker.gl)).toHaveLength(0);
    });

    it('a discrete invalidate after new values draws once with the new values', async () => {
        const worker = createSingleWorker(simUniforms());

        worker.bridge.setMotionGate('static');
        worker.tick(0);
        worker.gl.reset();

        worker.bridge.setUniformValues(PROGRAM_ID, { u_intensity: 0.9 });
        worker.bridge.invalidate(undefined, 'discrete');
        await Promise.resolve();
        expect(worker.pending()).toBe(1);
        worker.tick(16);

        expect(worker.errors).toEqual([]);
        const draws = uniformStateAtEachDraw(worker.gl);
        expect(draws).toHaveLength(1);
        expect(draws[0].u_intensity).toBe(0.9);
    });

    it('a static poster drawn after the values are posted paints the posted values, not the init default', () => {
        const worker = createSingleWorker(simUniforms());

        worker.bridge.setMotionGate('static');
        worker.bridge.setUniformValues(PROGRAM_ID, { u_intensity: 0.9 });
        worker.bridge.renderFrame(0);

        expect(worker.errors).toEqual([]);
        const draws = uniformStateAtEachDraw(worker.gl);
        expect(draws).toHaveLength(1);
        expect(draws[0].u_intensity).toBe(0.9);
    });
});
