import { describe, expect, it, vi } from 'vitest';

import { vec2, vec3 } from '@/core';
import type { InstancingConfig, RenderPass, ShaderProgramConfig } from '@/types';
import type { MainToWorker, WorkerToMain } from '@/worker/protocol';
import type {
    WorkerBridgeCallbacks,
    WorkerBridgeInit,
    WorkerBridgeMessageEvent,
    WorkerTransport
} from '@/worker/WorkerBridge';
import { WorkerBridge } from '@/worker/WorkerBridge';

const FAKE_CANVAS = {} as unknown as OffscreenCanvas;

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: []
};

function createFakeTransport(): {
    transport: WorkerTransport;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    emit: (message: WorkerToMain) => void;
    listenerCount: () => number;
    } {
    const postMessage = vi.fn();
    const terminate = vi.fn();
    const listeners: ((event: WorkerBridgeMessageEvent<WorkerToMain>) => void)[] = [];

    const transport: WorkerTransport = {
        postMessage: (message: MainToWorker, transfer?: Transferable[]) => {
            postMessage(message, transfer);
        },
        addEventListener: (_type, listener) => {
            listeners.push(listener);
        },
        removeEventListener: (_type, listener) => {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        },
        terminate
    };

    return {
        transport,
        postMessage,
        terminate,
        emit: message => {
            listeners.forEach(listener => { listener({ data: message }) });
        },
        listenerCount: () => listeners.length
    };
}

function baseInit(overrides: Partial<WorkerBridgeInit> = {}): WorkerBridgeInit {
    return {
        canvas: FAKE_CANVAS,
        kind: 'single',
        programConfigs: { main: CONFIG },
        uniforms: { main: {} },
        frameloop: 'always',
        speed: 1,
        ...overrides
    };
}

function pingPongInit(passes: RenderPass[], overrides: Partial<WorkerBridgeInit> = {}): WorkerBridgeInit {
    return baseInit({
        kind: 'pingpong',
        programConfigs: { main: CONFIG, blur: CONFIG },
        uniforms: { main: {}, blur: {} },
        passes,
        ...overrides
    });
}

function emitReady(fake: ReturnType<typeof createFakeTransport>): void {
    fake.emit({ type: 'ready', capabilities: { maxTextureSize: 4096, extensions: [] } });
}

function initMessage(fake: ReturnType<typeof createFakeTransport>): Extract<MainToWorker, { type: 'init' }> {
    const [message] = fake.postMessage.mock.calls[0] as [MainToWorker];
    if (message.type !== 'init') {
        throw new Error('expected init message');
    }
    return message;
}

describe('WorkerBridge init assembly', () => {
    it('posts an init message transferring the canvas', () => {
        const fake = createFakeTransport();
        new WorkerBridge(fake.transport, baseInit());

        expect(fake.postMessage).toHaveBeenCalledTimes(1);
        const [message, transfer] = fake.postMessage.mock.calls[0] as [MainToWorker, Transferable[]];
        expect(message.type).toBe('init');
        expect(transfer).toEqual([FAKE_CANVAS]);
    });

    it('builds descriptors and initial values from value uniforms', () => {
        const fake = createFakeTransport();
        new WorkerBridge(fake.transport, baseInit({
            uniforms: {
                main: {
                    u_intensity: { type: 'float', value: 0.5 },
                    u_palette: { type: 'vec3', value: vec3([1, 0, 0]) }
                }
            }
        }));

        const [message] = fake.postMessage.mock.calls[0] as [MainToWorker];
        if (message.type !== 'init') {
            throw new Error('expected init message');
        }
        expect(message.config.descriptors.main).toEqual([
            { name: 'u_intensity', type: 'float' },
            { name: 'u_palette', type: 'vec3' }
        ]);
        expect(message.config.initialValues.main).toEqual({
            u_intensity: 0.5,
            u_palette: [1, 0, 0]
        });
    });
});

describe('WorkerBridge fail-loud boundary', () => {
    it('throws naming the uniform and program for a non-built-in function uniform', () => {
        const fake = createFakeTransport();
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } }
        }))).toThrow(/u_mouse/);
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } }
        }))).toThrow(/main/);
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } }
        }))).toThrow(/liveUniforms/);
    });

    it('does not throw for a function uniform listed in liveUniforms', () => {
        const fake = createFakeTransport();
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } },
            liveUniforms: { main: ['u_mouse'] }
        }))).not.toThrow();
    });

    it('does not throw for a function-valued built-in uniform (u_time / u_resolution)', () => {
        const fake = createFakeTransport();
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: {
                main: {
                    u_time: { type: 'float', value: (time?: number) => (time ?? 0) * 0.001 },
                    u_resolution: { type: 'vec2', value: () => vec2([1, 1]) }
                }
            }
        }))).not.toThrow();
    });

    it('throws for a non-clone-safe non-function uniform value', () => {
        const fake = createFakeTransport();
        expect(() => new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_bad: { type: 'float', value: { nope: true } as unknown as number } } }
        }))).toThrow(/u_bad/);
    });

    it('throws naming the uniform, the pass, and the program for a non-built-in function pass uniform', () => {
        const passes: RenderPass[] = [
            { programId: 'main', inputTextures: [] },
            {
                programId: 'blur',
                inputTextures: [],
                uniforms: { u_amount: { type: 'float', value: () => 1 } }
            }
        ];
        const build = (): WorkerBridge => new WorkerBridge(createFakeTransport().transport, pingPongInit(passes));

        expect(build).toThrow(/u_amount/);
        expect(build).toThrow(/pass 1/);
        expect(build).toThrow(/blur/);
    });

    it('still throws for a function pass uniform listed in liveUniforms, explaining why', () => {
        const passes: RenderPass[] = [{
            programId: 'blur',
            inputTextures: [],
            uniforms: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } }
        }];
        const build = (): WorkerBridge => new WorkerBridge(
            createFakeTransport().transport,
            pingPongInit(passes, { liveUniforms: { blur: ['u_mouse'] } })
        );

        expect(build).toThrow(/u_mouse/);
        expect(build).toThrow(/liveUniforms/);
        expect(build).toThrow(/does not cover pass uniforms/);
    });

    it('does not throw for a function-valued built-in pass uniform, marking it worker-computed', () => {
        const fake = createFakeTransport();
        const passes: RenderPass[] = [{
            programId: 'blur',
            inputTextures: [],
            uniforms: {
                u_time: { type: 'float', value: (time: number) => time * 0.001 },
                u_resolution: {
                    type: 'vec2',
                    value: (_time: number, width: number, height: number) => vec2([width, height])
                },
                u_color: { type: 'vec3', value: vec3([1, 0, 0]) }
            }
        }];

        expect(() => new WorkerBridge(fake.transport, pingPongInit(passes))).not.toThrow();

        expect(initMessage(fake).config.passes?.[0].uniforms).toEqual({
            u_time: { kind: 'builtin', type: 'float' },
            u_resolution: { kind: 'builtin', type: 'vec2' },
            u_color: { kind: 'value', type: 'vec3', value: [1, 0, 0] }
        });
    });

    it('throws for a non-clone-safe non-function pass uniform value', () => {
        const passes: RenderPass[] = [{
            programId: 'blur',
            inputTextures: [],
            uniforms: { u_bad: { type: 'float', value: { nope: true } as unknown as number } }
        }];

        expect(() => new WorkerBridge(createFakeTransport().transport, pingPongInit(passes)))
            .toThrow(/u_bad/);
    });

    it('throws naming instancing when an instancing config is present in worker mode', () => {
        const fake = createFakeTransport();
        const instancing: InstancingConfig = {
            instanceCount: 10,
            attributes: {}
        };
        expect(() => new WorkerBridge(fake.transport, baseInit({ instancing })))
            .toThrow(/instancing/);
    });
});

describe('WorkerBridge value-diff posting', () => {
    it('posts setUniformValues only for uniforms that actually changed', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit({
            uniforms: {
                main: {
                    u_a: { type: 'float', value: 1 },
                    u_b: { type: 'vec3', value: vec3([0, 0, 0]) }
                }
            }
        }));
        fake.postMessage.mockClear();

        bridge.setUniformValues('main', { u_a: 1, u_b: [0, 0, 0] });
        expect(fake.postMessage).not.toHaveBeenCalled();

        bridge.setUniformValues('main', { u_a: 2, u_b: [0, 0, 0] });
        expect(fake.postMessage).toHaveBeenCalledTimes(1);
        expect(fake.postMessage).toHaveBeenCalledWith(
            { type: 'setUniformValues', programId: 'main', values: { u_a: 2 } },
            undefined
        );

        fake.postMessage.mockClear();
        bridge.setUniformValues('main', { u_a: 2 });
        expect(fake.postMessage).not.toHaveBeenCalled();

        bridge.setUniformValues('main', { u_b: [1, 0, 0] });
        expect(fake.postMessage).toHaveBeenCalledWith(
            { type: 'setUniformValues', programId: 'main', values: { u_b: [1, 0, 0] } },
            undefined
        );
    });

    it('posts a change made by mutating the caller array in place', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_b: { type: 'vec3', value: vec3([0, 0, 0]) } } }
        }));
        fake.postMessage.mockClear();

        const live = [0, 0, 0];
        bridge.setUniformValues('main', { u_b: live });
        expect(fake.postMessage).not.toHaveBeenCalled();

        live[0] = 1;
        bridge.setUniformValues('main', { u_b: live });

        expect(fake.postMessage).toHaveBeenCalledTimes(1);
        expect(fake.postMessage).toHaveBeenCalledWith(
            { type: 'setUniformValues', programId: 'main', values: { u_b: [1, 0, 0] } },
            undefined
        );
    });

    it('does not re-post an unchanged NaN value', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_a: { type: 'float', value: 0 } } }
        }));
        fake.postMessage.mockClear();

        bridge.setUniformValues('main', { u_a: Number.NaN });
        expect(fake.postMessage).toHaveBeenCalledTimes(1);

        bridge.setUniformValues('main', { u_a: Number.NaN });
        expect(fake.postMessage).toHaveBeenCalledTimes(1);
    });

    it('normalizes typed array values and throws on non-clone-safe values', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_b: { type: 'vec3', value: vec3([0, 0, 0]) } } }
        }));
        fake.postMessage.mockClear();

        bridge.setUniformValues('main', { u_b: new Float32Array([1, 2, 3]) });
        expect(fake.postMessage).toHaveBeenCalledWith(
            { type: 'setUniformValues', programId: 'main', values: { u_b: [1, 2, 3] } },
            undefined
        );

        expect(() => { bridge.setUniformValues('main', { u_b: (() => 1) as unknown as number }) })
            .toThrow(/u_b/);
    });
});

describe('WorkerBridge unknown programs', () => {
    it('throws instead of inventing a dirty-check entry for a program that was never declared', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit({
            uniforms: { main: { u_a: { type: 'float', value: 1 } } }
        }));
        fake.postMessage.mockClear();

        expect(() => { bridge.setUniformValues('blur', { u_a: 2 }) }).toThrow(/blur/);
        expect(() => { bridge.setUniformValues('blur', { u_a: 2 }) }).toThrow(/main/);
        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('accepts a program declared with an empty uniform map', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, pingPongInit([{ programId: 'main', inputTextures: [] }]));
        fake.postMessage.mockClear();

        expect(() => { bridge.setUniformValues('blur', {}) }).not.toThrow();
        expect(fake.postMessage).not.toHaveBeenCalled();
    });
});

describe('WorkerBridge ready idempotency', () => {
    it('only flushes the queued resize and calls onReady for the first ready message', () => {
        const fake = createFakeTransport();
        const onReady = vi.fn();
        const bridge = new WorkerBridge(fake.transport, baseInit(), { onReady });

        bridge.resize(100, 200);
        emitReady(fake);
        emitReady(fake);

        expect(onReady).toHaveBeenCalledTimes(1);
        const resizeCalls = fake.postMessage.mock.calls.filter(
            call => (call[0] as MainToWorker).type === 'resize'
        );
        expect(resizeCalls).toHaveLength(1);
    });
});

describe('WorkerBridge motion gate', () => {
    it('forwards the motion gate so the worker loop applies the same motion semantics', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.setMotionGate('static');
        bridge.setMotionGate('none');

        expect(fake.postMessage).toHaveBeenNthCalledWith(1, { type: 'setMotionGate', gate: 'static' }, undefined);
        expect(fake.postMessage).toHaveBeenNthCalledWith(2, { type: 'setMotionGate', gate: 'none' }, undefined);
    });

    it('goes inert after dispose', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        bridge.dispose();
        fake.postMessage.mockClear();

        bridge.setMotionGate('pause');

        expect(fake.postMessage).not.toHaveBeenCalled();
    });
});

describe('WorkerBridge skipDefaultUniforms', () => {
    it('forwards skipDefaultUniforms so the worker does not auto-register u_time / u_resolution', () => {
        const fake = createFakeTransport();
        new WorkerBridge(fake.transport, baseInit({ skipDefaultUniforms: true }));

        expect(initMessage(fake).config.skipDefaultUniforms).toBe(true);
    });
});

describe('WorkerBridge setPasses', () => {
    it('posts serialized passes, applying the same built-in exemption and fail-loud rules', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, pingPongInit([{ programId: 'main', inputTextures: [] }]));
        fake.postMessage.mockClear();

        bridge.setPasses([{
            programId: 'blur',
            inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read' }],
            outputFramebuffer: null,
            uniforms: {
                u_time: { type: 'float', value: (time: number) => time },
                u_amount: { type: 'float', value: 0.25 }
            }
        }]);

        expect(fake.postMessage).toHaveBeenCalledWith({
            type: 'setPasses',
            passes: [{
                programId: 'blur',
                inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read' }],
                outputFramebuffer: null,
                uniforms: {
                    u_time: { kind: 'builtin', type: 'float' },
                    u_amount: { kind: 'value', type: 'float', value: 0.25 }
                },
                renderOptions: undefined
            }]
        }, undefined);

        expect(() => {
            bridge.setPasses([{
                programId: 'blur',
                inputTextures: [],
                uniforms: { u_amount: { type: 'float', value: () => 1 } }
            }]);
        }).toThrow(/u_amount/);
    });
});

describe('WorkerBridge invalidate coalescing', () => {
    it('collapses synchronous invalidate calls into one message using the max frames', async () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.invalidate();
        bridge.invalidate(3);
        bridge.invalidate(2);

        expect(fake.postMessage).not.toHaveBeenCalled();
        await Promise.resolve();

        expect(fake.postMessage).toHaveBeenCalledTimes(1);
        expect(fake.postMessage).toHaveBeenCalledWith({ type: 'invalidate', frames: 3 }, undefined);
    });

    it('throws instead of posting a garbage frame count across the boundary', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        expect(() => { bridge.invalidate(0) }).toThrow(/positive integer/);
        expect(() => { bridge.invalidate(-1) }).toThrow(/positive integer/);
        expect(() => { bridge.invalidate(1.5) }).toThrow(/positive integer/);
        expect(() => { bridge.invalidate(Number.NaN) }).toThrow(/positive integer/);
        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('starts a fresh coalescing window after a flush', async () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.invalidate(1);
        await Promise.resolve();
        expect(fake.postMessage).toHaveBeenCalledTimes(1);

        bridge.invalidate(5);
        await Promise.resolve();
        expect(fake.postMessage).toHaveBeenCalledTimes(2);
        expect(fake.postMessage).toHaveBeenLastCalledWith({ type: 'invalidate', frames: 5 }, undefined);
    });
});

describe('WorkerBridge resize queueing', () => {
    it('queues resizes last-wins before ready and flushes exactly one on ready', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.resize(100, 200);
        bridge.resize(50, 60);
        expect(fake.postMessage).not.toHaveBeenCalled();

        emitReady(fake);

        const resizeCalls = fake.postMessage.mock.calls.filter(
            call => (call[0] as MainToWorker).type === 'resize'
        );
        expect(resizeCalls).toHaveLength(1);
        expect(resizeCalls[0][0]).toEqual({ type: 'resize', renderWidth: 50, renderHeight: 60 });
    });

    it('does not post a resize on ready when none was queued', () => {
        const fake = createFakeTransport();
        new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        emitReady(fake);

        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('posts resizes immediately after ready', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        emitReady(fake);
        fake.postMessage.mockClear();

        bridge.resize(10, 20);

        expect(fake.postMessage).toHaveBeenCalledWith({ type: 'resize', renderWidth: 10, renderHeight: 20 }, undefined);
    });
});

describe('WorkerBridge active gating', () => {
    it('sends the initial active state in the init config so the dedupe is not an assumption', () => {
        const activeFake = createFakeTransport();
        new WorkerBridge(activeFake.transport, baseInit());
        expect(initMessage(activeFake).config.active).toBe(true);

        const hiddenFake = createFakeTransport();
        const hidden = new WorkerBridge(hiddenFake.transport, baseInit({ active: false }));
        expect(initMessage(hiddenFake).config.active).toBe(false);

        hiddenFake.postMessage.mockClear();
        hidden.setActive(false);
        expect(hiddenFake.postMessage).not.toHaveBeenCalled();

        hidden.setActive(true);
        expect(hiddenFake.postMessage).toHaveBeenCalledWith({ type: 'setActive', active: true }, undefined);
    });

    it('only posts setActive when the value actually changes from the default (active)', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.setActive(true);
        expect(fake.postMessage).not.toHaveBeenCalled();

        bridge.setActive(false);
        expect(fake.postMessage).toHaveBeenCalledWith({ type: 'setActive', active: false }, undefined);

        fake.postMessage.mockClear();
        bridge.setActive(false);
        expect(fake.postMessage).not.toHaveBeenCalled();

        bridge.setActive(true);
        expect(fake.postMessage).toHaveBeenCalledWith({ type: 'setActive', active: true }, undefined);
    });
});

describe('WorkerBridge lifecycle passthroughs', () => {
    it('forwards setFrameloop, setSpeed, and renderFrame immediately', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.setFrameloop('demand');
        bridge.setSpeed(2);
        bridge.renderFrame(123);

        expect(fake.postMessage).toHaveBeenNthCalledWith(1, { type: 'setFrameloop', mode: 'demand' }, undefined);
        expect(fake.postMessage).toHaveBeenNthCalledWith(2, { type: 'setSpeed', speed: 2 }, undefined);
        expect(fake.postMessage).toHaveBeenNthCalledWith(3, { type: 'renderFrame', time: 123 }, undefined);
    });
});

describe('WorkerBridge dispose', () => {
    it('posts dispose, detaches the listener, terminates the transport, and becomes inert', async () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        expect(fake.listenerCount()).toBe(1);
        fake.postMessage.mockClear();

        bridge.dispose();

        expect(fake.postMessage).toHaveBeenCalledWith({ type: 'dispose' }, undefined);
        expect(fake.terminate).toHaveBeenCalledTimes(1);
        expect(fake.listenerCount()).toBe(0);

        fake.postMessage.mockClear();
        bridge.setActive(false);
        bridge.setFrameloop('never');
        bridge.setSpeed(0);
        bridge.renderFrame(1);
        bridge.resize(1, 1);
        bridge.invalidate();
        await Promise.resolve();
        bridge.setUniformValues('main', { u_a: 1 });
        bridge.dispose();

        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('does not flush an invalidate microtask scheduled before dispose', async () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());
        fake.postMessage.mockClear();

        bridge.invalidate(2);
        bridge.dispose();
        fake.postMessage.mockClear();
        await Promise.resolve();

        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('drops a resize queued before ready when disposed first', () => {
        const fake = createFakeTransport();
        const bridge = new WorkerBridge(fake.transport, baseInit());

        bridge.resize(10, 20);
        bridge.dispose();
        fake.postMessage.mockClear();
        emitReady(fake);

        expect(fake.postMessage).not.toHaveBeenCalled();
    });

    it('ignores inbound messages received after dispose', () => {
        const fake = createFakeTransport();
        const onReady = vi.fn();
        const callbacks: WorkerBridgeCallbacks = { onReady };
        const bridge = new WorkerBridge(fake.transport, baseInit(), callbacks);

        bridge.dispose();
        emitReady(fake);

        expect(onReady).not.toHaveBeenCalled();
    });
});

describe('WorkerBridge inbound message callbacks', () => {
    it('surfaces ready, contextlost, contextrestored, and error to injected callbacks', () => {
        const fake = createFakeTransport();
        const onReady = vi.fn();
        const onContextLost = vi.fn();
        const onContextRestored = vi.fn();
        const onError = vi.fn();
        new WorkerBridge(fake.transport, baseInit(), { onReady, onContextLost, onContextRestored, onError });

        emitReady(fake);
        expect(onReady).toHaveBeenCalledWith({ maxTextureSize: 4096, extensions: [] });

        fake.emit({ type: 'contextlost' });
        expect(onContextLost).toHaveBeenCalledTimes(1);

        fake.emit({ type: 'contextrestored' });
        expect(onContextRestored).toHaveBeenCalledTimes(1);

        fake.emit({ type: 'error', message: 'program link failed' });
        expect(onError).toHaveBeenCalledWith('program link failed');
    });
});
