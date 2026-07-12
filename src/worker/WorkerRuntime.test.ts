import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { ShaderProgramConfig } from '@/types';
import type { MainToWorker, SerializableRenderPass, WorkerInitConfig, WorkerToMain } from '@/worker/protocol';
import type { WorkerRuntimeHost } from '@/worker/WorkerRuntime';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: [
        { name: 'u_time', type: 'float' },
        { name: 'u_resolution', type: 'vec2' },
        { name: 'u_intensity', type: 'float' },
        { name: 'u_color', type: 'vec3' }
    ]
};

const DESCRIPTORS = [
    { name: 'u_intensity', type: 'float' as const },
    { name: 'u_color', type: 'vec3' as const }
];

interface OffscreenStub {
    canvas: OffscreenCanvas;
    gl: GLStubHandle;
    lose: () => void;
    restore: (overrides?: GLStubConfig) => void;
    listenerCount: () => number;
}

function createOffscreenStub(config: GLStubConfig = {}): OffscreenStub {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    let stub: GLStubHandle | null = null;

    const canvas = {
        width: 0,
        height: 0,
        getContext: (): WebGLRenderingContext | null => stub?.gl ?? null,
        addEventListener: (type: string, listener: (event: Event) => void): void => {
            const existing = listeners.get(type) ?? [];
            existing.push(listener);
            listeners.set(type, existing);
        },
        removeEventListener: (type: string, listener: (event: Event) => void): void => {
            const existing = listeners.get(type) ?? [];
            const index = existing.indexOf(listener);
            if (index !== -1) {
                existing.splice(index, 1);
            }
        }
    };

    const offscreen = canvas as unknown as OffscreenCanvas;
    const glConfig: GLStubConfig = {
        ...config,
        overrides: { canvas: offscreen, ...config.overrides }
    };

    stub = createGLStub(glConfig);

    const emit = (type: string): void => {
        const event = { preventDefault: (): void => undefined } as unknown as Event;
        [...(listeners.get(type) ?? [])].forEach(listener => { listener(event) });
    };

    return {
        canvas: offscreen,
        gl: stub,
        lose: () => {
            glConfig.contextLost = true;
            emit('webglcontextlost');
        },
        restore: overrides => {
            Object.assign(glConfig, overrides ?? {});
            glConfig.contextLost = false;
            emit('webglcontextrestored');
        },
        listenerCount: () =>
            Array.from(listeners.values()).reduce((total, entries) => total + entries.length, 0)
    };
}

interface RuntimeHarness {
    posted: WorkerToMain[];
    cancels: number[];
    close: ReturnType<typeof vi.fn>;
    pendingHandles: () => number[];
    tick: (now: number) => void;
    send: (message: MainToWorker) => void;
}

function createHarness(): RuntimeHarness {
    const posted: WorkerToMain[] = [];
    const cancels: number[] = [];
    const scheduled = new Map<number, (now: number) => void>();
    const close = vi.fn();
    let nextHandle = 1;

    const host: WorkerRuntimeHost = {
        postMessage: message => { posted.push(message) },
        requestAnimationFrame: callback => {
            const handle = nextHandle;
            nextHandle += 1;
            scheduled.set(handle, callback);
            return handle;
        },
        cancelAnimationFrame: handle => {
            cancels.push(handle);
            scheduled.delete(handle);
        },
        now: () => 0,
        close: () => { close() }
    };

    const runtime = new WorkerRuntime(host);

    return {
        posted,
        cancels,
        close,
        pendingHandles: () => Array.from(scheduled.keys()),
        tick: now => {
            const callbacks = Array.from(scheduled.values());
            scheduled.clear();
            callbacks.forEach(callback => { callback(now) });
        },
        send: message => { runtime.handleMessage(message) }
    };
}

function initMessage(canvas: OffscreenCanvas, overrides: Partial<WorkerInitConfig> = {}): MainToWorker {
    return {
        type: 'init',
        canvas,
        config: {
            programConfigs: { main: CONFIG },
            kind: 'single',
            initialValues: { main: { u_intensity: 0.25 } },
            descriptors: { main: DESCRIPTORS },
            frameloop: 'always',
            speed: 1,
            active: true,
            ...overrides
        }
    };
}

function pingPongInit(canvas: OffscreenCanvas, overrides: Partial<WorkerInitConfig> = {}): MainToWorker {
    return initMessage(canvas, {
        kind: 'pingpong',
        passes: pingPongPasses(),
        initialValues: { main: {} },
        descriptors: { main: [] },
        ...overrides
    });
}

function pingPongPasses(): SerializableRenderPass[] {
    return [
        {
            programId: 'main',
            inputTextures: [],
            outputFramebuffer: null,
            uniforms: {
                u_time: { kind: 'builtin', type: 'float' },
                u_intensity: { kind: 'value', type: 'float', value: 0.5 }
            }
        }
    ];
}

function floatUploads(gl: GLStubHandle): unknown[] {
    return gl.uniformCalls.filter(call => call.name === 'uniform1f').map(call => call.value);
}

function vec2Uploads(gl: GLStubHandle): number[][] {
    return gl.uniformCalls
        .filter(call => call.name === 'uniform2fv')
        .map(call => Array.from(call.value as Float32Array));
}

function callCount(gl: GLStubHandle, name: string): number {
    return gl.calls.filter(call => call.name === name).length;
}

function drawCount(gl: GLStubHandle): number {
    return callCount(gl, 'drawArrays');
}

function linkCount(gl: GLStubHandle): number {
    return callCount(gl, 'linkProgram');
}

function errorCount(posted: WorkerToMain[]): number {
    return posted.filter(message => message.type === 'error').length;
}

function lastError(posted: WorkerToMain[]): string {
    const message = [...posted].reverse().find(entry => entry.type === 'error');
    if (message?.type !== 'error') {
        throw new Error(`expected an "error" message, worker posted ${JSON.stringify(posted)}`);
    }
    return message.message;
}

describe('WorkerRuntime init', () => {
    it('creates the program, the quad buffer and posts ready with capabilities', () => {
        const offscreen = createOffscreenStub({
            extensions: { ANGLE_instanced_arrays: true },
            maxTextureSize: 8192
        });
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));

        expect(linkCount(offscreen.gl)).toBe(1);
        expect(offscreen.gl.calls.filter(call => call.name === 'bufferData')).toHaveLength(1);
        expect(harness.posted).toEqual([
            {
                type: 'ready',
                capabilities: { maxTextureSize: 8192, extensions: ['ANGLE_instanced_arrays'] }
            }
        ]);
    });

    it('posts an error rather than rendering blank when the program fails to link', () => {
        const offscreen = createOffscreenStub({ linkFails: true });
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));

        expect(lastError(harness.posted)).toContain('link');
        expect(harness.pendingHandles()).toHaveLength(0);
        expect(drawCount(offscreen.gl)).toBe(0);
    });

    it('rejects a message that arrives before init', () => {
        const harness = createHarness();

        harness.send({ type: 'resize', renderWidth: 10, renderHeight: 10 });

        expect(lastError(harness.posted)).toBe('micugl worker: received "resize" before "init"');
    });

    it('rejects a second init', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.send(initMessage(offscreen.canvas));

        expect(lastError(harness.posted)).toContain('second "init"');
    });

    it('reports a failed init once and then stays quiet instead of erroring per message', () => {
        const offscreen = createOffscreenStub({ linkFails: true });
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        expect(errorCount(harness.posted)).toBe(1);

        harness.send({ type: 'resize', renderWidth: 10, renderHeight: 10 });
        harness.send({ type: 'resize', renderWidth: 20, renderHeight: 20 });
        harness.send({ type: 'invalidate', frames: 1 });

        expect(errorCount(harness.posted)).toBe(1);
    });

    it('never rebuilds or reports a restored context for a runtime that never finished init', () => {
        const offscreen = createOffscreenStub({ linkFails: true });
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        const linksAfterFailure = linkCount(offscreen.gl);

        offscreen.lose();
        offscreen.restore({ linkFails: false });

        expect(linkCount(offscreen.gl)).toBe(linksAfterFailure);
        expect(harness.posted.some(message => message.type === 'contextrestored')).toBe(false);
        expect(harness.posted.some(message => message.type === 'ready')).toBe(false);
        expect(drawCount(offscreen.gl)).toBe(0);
    });
});

describe('WorkerRuntime uniforms', () => {
    let offscreen: OffscreenStub;
    let harness: RuntimeHarness;

    beforeEach(() => {
        offscreen = createOffscreenStub();
        harness = createHarness();
        harness.send(initMessage(offscreen.canvas));
    });

    it('uploads a posted value on the next frame', () => {
        harness.tick(0);
        offscreen.gl.reset();

        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_intensity: 0.75 } });
        harness.tick(16);

        expect(floatUploads(offscreen.gl)).toContain(0.75);
    });

    it('re-wraps a posted plain array into a pooled Float32Array', () => {
        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_color: [1, 0.5, 0] } });
        harness.tick(16);

        const vectors = offscreen.gl.uniformCalls.filter(call => call.name === 'uniform3fv');
        expect(vectors).toHaveLength(1);
        expect(vectors[0].value).toBeInstanceOf(Float32Array);
        expect(Array.from(vectors[0].value as Float32Array)).toEqual([1, 0.5, 0]);
    });

    it('computes u_time itself, advancing it every frame', () => {
        harness.tick(1000);
        harness.tick(2000);
        harness.tick(4000);

        expect(floatUploads(offscreen.gl)).toEqual(expect.arrayContaining([0, 1, 3]));
    });

    it('computes u_resolution from the canvas size the worker was resized to', () => {
        harness.send({ type: 'resize', renderWidth: 640, renderHeight: 480 });
        harness.tick(16);

        expect(vec2Uploads(offscreen.gl).at(-1)).toEqual([640, 480]);
        expect(offscreen.gl.viewportCalls.at(-1)).toEqual([0, 0, 640, 480]);
    });

    it('fails loud on a value for an undeclared uniform', () => {
        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_unknown: 1 } });

        expect(lastError(harness.posted)).toContain('u_unknown');
    });

    it('fails loud on a value for an unknown program', () => {
        harness.send({ type: 'setUniformValues', programId: 'ghost', values: { u_intensity: 1 } });

        expect(lastError(harness.posted)).toContain('unknown program "ghost"');
    });

    it('fails loud on a vector value whose component count is wrong', () => {
        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_color: [1, 0] } });

        expect(lastError(harness.posted)).toContain('3 components');
    });
});

describe('WorkerRuntime scheduling', () => {
    it('cancels the scheduled frame when the main thread deactivates it, and resumes on reactivation', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        expect(harness.pendingHandles()).toHaveLength(1);

        harness.send({ type: 'setActive', active: false });

        expect(harness.cancels).toHaveLength(1);
        expect(harness.pendingHandles()).toHaveLength(0);

        harness.send({ type: 'setActive', active: true });
        expect(harness.pendingHandles()).toHaveLength(1);
    });

    it('schedules nothing when speed is 0', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { speed: 0 }));

        expect(harness.pendingHandles()).toHaveLength(0);
    });

    it('renders only on demand, honouring a multi-frame invalidate', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { frameloop: 'demand' }));
        harness.tick(16);
        offscreen.gl.reset();

        harness.tick(32);
        expect(drawCount(offscreen.gl)).toBe(0);

        harness.send({ type: 'invalidate', frames: 3 });
        harness.tick(48);
        harness.tick(64);
        harness.tick(80);
        harness.tick(96);

        expect(drawCount(offscreen.gl)).toBe(3);
    });

    it('rejects a non-positive invalidate frame count', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.send({ type: 'invalidate', frames: 0 });

        expect(lastError(harness.posted)).toContain('positive integer');
    });

    it('draws exactly once for renderFrame, at the requested time', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { frameloop: 'never', active: false }));
        offscreen.gl.reset();

        harness.send({ type: 'renderFrame', time: 500 });

        expect(drawCount(offscreen.gl)).toBe(1);
        expect(harness.pendingHandles()).toHaveLength(0);
        expect(floatUploads(offscreen.gl)).toContain(0.5);
    });

    it('sets the loop clock from renderFrame, so later frames continue from the rendered frame', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.tick(0);

        harness.send({ type: 'renderFrame', time: 2000 });
        expect(floatUploads(offscreen.gl)).toContain(2);

        offscreen.gl.reset();
        harness.tick(5000);
        harness.tick(6000);

        expect(drawCount(offscreen.gl)).toBe(2);
        expect(floatUploads(offscreen.gl)).toEqual([3]);
    });

    it('suppresses the clear when renderOptions.clear is false', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { renderOptions: { clear: false } }));
        harness.tick(16);

        expect(drawCount(offscreen.gl)).toBe(1);
        expect(callCount(offscreen.gl, 'clear')).toBe(0);
    });

    it('clears by default', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.tick(16);

        expect(callCount(offscreen.gl, 'clear')).toBe(1);
    });
});

describe('WorkerRuntime ping-pong passes', () => {
    it('computes a built-in pass uniform every frame instead of freezing it', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(pingPongInit(offscreen.canvas));

        harness.tick(1000);
        harness.tick(2000);
        harness.tick(4000);

        const uploads = floatUploads(offscreen.gl);
        expect(uploads).toEqual(expect.arrayContaining([0, 1, 3, 0.5]));
    });

    it('computes the built-ins its program declares even when no pass names them', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(pingPongInit(offscreen.canvas));
        harness.send({ type: 'resize', renderWidth: 320, renderHeight: 200 });
        harness.tick(16);

        expect(vec2Uploads(offscreen.gl).at(-1)).toEqual([320, 200]);
    });

    it('creates and resizes the framebuffers it was initialized with', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(pingPongInit(offscreen.canvas, { framebuffers: { sim: { width: 0, height: 0 } } }));
        harness.send({ type: 'resize', renderWidth: 64, renderHeight: 32 });

        const allocations = offscreen.gl.texImage2DCalls.filter(call => call.width === 64 && call.height === 32);
        expect(allocations).toHaveLength(2);
    });

    it('applies a new pass list on setPasses', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(pingPongInit(offscreen.canvas));
        harness.tick(0);
        offscreen.gl.reset();

        harness.send({
            type: 'setPasses',
            passes: [
                {
                    ...pingPongPasses()[0],
                    uniforms: { u_intensity: { kind: 'value', type: 'float', value: 0.9 } }
                }
            ]
        });
        harness.tick(16);

        expect(floatUploads(offscreen.gl)).toContain(0.9);
    });

    it('rejects setPasses on a single-program worker', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.send({ type: 'setPasses', passes: pingPongPasses() });

        expect(lastError(harness.posted)).toContain('single');
    });
});

describe('WorkerRuntime context loss', () => {
    it('stops the loop on loss, then rebuilds and resumes on restore', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.tick(16);
        expect(harness.pendingHandles()).toHaveLength(1);

        const linksBefore = linkCount(offscreen.gl);
        offscreen.lose();

        expect(harness.pendingHandles()).toHaveLength(0);
        expect(harness.cancels).toHaveLength(1);
        expect(harness.posted.at(-1)).toEqual({ type: 'contextlost' });

        offscreen.restore();

        expect(linkCount(offscreen.gl)).toBe(linksBefore + 1);
        expect(harness.posted.at(-1)).toEqual({ type: 'contextrestored' });
        expect(harness.pendingHandles()).toHaveLength(1);

        offscreen.gl.reset();
        harness.tick(32);
        expect(drawCount(offscreen.gl)).toBe(1);
    });

    it('destroys the GL resources of the lost context before rebuilding', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        offscreen.lose();
        offscreen.restore();

        expect(callCount(offscreen.gl, 'deleteProgram')).toBe(1);
        expect(linkCount(offscreen.gl)).toBe(2);
    });

    it('keeps the latest posted uniform values across a restore', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_intensity: 0.42 } });

        offscreen.lose();
        offscreen.restore();
        offscreen.gl.reset();

        harness.tick(16);

        expect(floatUploads(offscreen.gl)).toContain(0.42);
    });

    it('does not resume a runtime that was inactive when the context was lost', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { active: false }));

        offscreen.lose();
        offscreen.restore();

        expect(harness.pendingHandles()).toHaveLength(0);
    });

    it('does not start the render loop while the context is lost', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        offscreen.lose();
        expect(harness.pendingHandles()).toHaveLength(0);

        harness.send({ type: 'setActive', active: false });
        harness.send({ type: 'setActive', active: true });

        expect(harness.pendingHandles()).toHaveLength(0);
        expect(errorCount(harness.posted)).toBe(0);

        offscreen.restore();

        expect(harness.pendingHandles()).toHaveLength(1);
    });

    it('does not spend demand frames on the frames it cannot draw while the context is lost', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas, { frameloop: 'demand' }));
        harness.tick(0);

        offscreen.lose();
        harness.send({ type: 'setActive', active: true });
        harness.send({ type: 'invalidate', frames: 3 });

        harness.tick(16);
        harness.tick(32);
        harness.tick(48);

        offscreen.restore();
        offscreen.gl.reset();

        harness.tick(64);
        harness.tick(80);
        harness.tick(96);
        harness.tick(112);

        expect(drawCount(offscreen.gl)).toBe(3);
    });

    it('accepts resize and uniform values during a loss and applies them on restore', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        offscreen.lose();

        harness.send({ type: 'resize', renderWidth: 128, renderHeight: 64 });
        harness.send({ type: 'setUniformValues', programId: 'main', values: { u_intensity: 0.9 } });
        harness.send({ type: 'invalidate', frames: 1 });
        harness.tick(16);

        expect(errorCount(harness.posted)).toBe(0);
        expect(drawCount(offscreen.gl)).toBe(0);

        offscreen.restore();
        offscreen.gl.reset();
        harness.tick(32);

        expect(drawCount(offscreen.gl)).toBe(1);
        expect(floatUploads(offscreen.gl)).toContain(0.9);
        expect(vec2Uploads(offscreen.gl).at(-1)).toEqual([128, 64]);
    });
});

describe('WorkerRuntime dispose', () => {
    it('stops the loop, drops the canvas listeners and closes the worker', () => {
        const offscreen = createOffscreenStub();
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        expect(offscreen.listenerCount()).toBe(2);

        harness.send({ type: 'dispose' });

        expect(harness.pendingHandles()).toHaveLength(0);
        expect(offscreen.listenerCount()).toBe(0);
        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(callCount(offscreen.gl, 'deleteProgram')).toBe(1);

        harness.send({ type: 'renderFrame', time: 0 });
        expect(harness.posted.some(message => message.type === 'error')).toBe(false);
    });

    it('shuts the worker down when dispose arrives before init', () => {
        const harness = createHarness();

        harness.send({ type: 'dispose' });

        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(harness.posted).toEqual([]);
    });

    it('shuts the worker down after a failed init, and closes exactly once', () => {
        const offscreen = createOffscreenStub({ linkFails: true });
        const harness = createHarness();

        harness.send(initMessage(offscreen.canvas));
        harness.send({ type: 'dispose' });
        harness.send({ type: 'dispose' });

        expect(harness.close).toHaveBeenCalledTimes(1);
        expect(offscreen.listenerCount()).toBe(0);
        expect(errorCount(harness.posted)).toBe(1);
    });
});
