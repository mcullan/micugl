import type {
    FramebufferOptions,
    Frameloop,
    InstancingConfig,
    RenderPass,
    ShaderProgramConfig,
    UniformParam
} from '@/types';
import type {
    MainToWorker,
    SerializableRenderPass,
    SerializableRenderPassUniform,
    UniformDescriptor,
    UniformScalar,
    UniformValueMap,
    UniformVector,
    WorkerCapabilities,
    WorkerInitConfig,
    WorkerToMain
} from '@/worker/protocol';
import {
    isWorkerBuiltinUniformName,
    normalizeCloneSafeUniformValue,
    uniformValuesEqual,
    WORKER_BUILTIN_UNIFORM_NAMES
} from '@/worker/protocol';

export interface WorkerBridgeMessageEvent<T> {
    data: T;
}

export interface WorkerTransport {
    postMessage: (message: MainToWorker, transfer?: Transferable[]) => void;
    addEventListener: (
        type: 'message',
        listener: (event: WorkerBridgeMessageEvent<WorkerToMain>) => void
    ) => void;
    removeEventListener?: (
        type: 'message',
        listener: (event: WorkerBridgeMessageEvent<WorkerToMain>) => void
    ) => void;
    terminate?: () => void;
}

export interface WorkerBridgeCallbacks {
    onReady?: (capabilities: WorkerCapabilities) => void;
    onContextLost?: () => void;
    onContextRestored?: () => void;
    onError?: (message: string) => void;
}

export type WorkerBridgeProgramUniforms = Record<string, UniformParam>;

export interface WorkerBridgeInit {
    canvas: OffscreenCanvas;
    kind: 'single' | 'pingpong';
    programConfigs: Record<string, ShaderProgramConfig>;
    uniforms: Record<string, WorkerBridgeProgramUniforms>;
    passes?: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    frameloop: Frameloop;
    speed: number;
    active?: boolean;
    contextAttributes?: WebGLContextAttributes;
    liveUniforms?: Record<string, string[]>;
    instancing?: InstancingConfig;
}

function isLiveUniformName(
    liveUniforms: Record<string, string[]> | undefined,
    programId: string,
    name: string
): boolean {
    return liveUniforms?.[programId]?.includes(name) ?? false;
}

function functionUniformErrorMessage(programId: string, name: string): string {
    return `micugl worker: uniform "${name}" on program "${programId}" is a function and cannot be `
        + 'sent to a worker. Either give it a plain value (number, number[], or typed array) so it is '
        + `posted on change, or list "${name}" in the "liveUniforms" prop for program "${programId}" `
        + 'to have it evaluated on the main thread each frame.';
}

function notCloneSafeErrorMessage(programId: string, name: string): string {
    return `micugl worker: uniform "${name}" on program "${programId}" is not structured-clone-safe. `
        + 'Worker-mode uniform values must be a number, a number[], or a typed array.';
}

function passLabel(programId: string, passIndex: number): string {
    return `pass ${String(passIndex)} (program "${programId}")`;
}

function passUniformFunctionErrorMessage(programId: string, passIndex: number, name: string): string {
    const builtins = WORKER_BUILTIN_UNIFORM_NAMES.join(', ');
    return `micugl worker: pass uniform "${name}" on ${passLabel(programId, passIndex)} is a function and `
        + `cannot be sent to a worker. Only the worker-side built-ins (${builtins}) may be functions in a `
        + 'render pass, because the worker computes them itself from the frame time and canvas size. The '
        + `"liveUniforms" escape hatch does not cover pass uniforms in v1: per-frame overriding of pass `
        + `uniform values is not plumbed through the worker, so listing "${name}" there would silently do `
        + `nothing. Give "${name}" a plain value (number, number[], or typed array) instead, or turn off `
        + 'worker mode for this component.';
}

function passUniformNotCloneSafeErrorMessage(programId: string, passIndex: number, name: string): string {
    return `micugl worker: pass uniform "${name}" on ${passLabel(programId, passIndex)} is not `
        + 'structured-clone-safe. Render-pass uniform values must be a number, a number[], or a typed array.';
}

function buildProgramDescriptorsAndInitialValues(
    programId: string,
    uniforms: WorkerBridgeProgramUniforms,
    liveUniforms: Record<string, string[]> | undefined
): { descriptors: UniformDescriptor[]; initialValues: UniformValueMap } {
    const descriptors: UniformDescriptor[] = [];
    const initialValues: UniformValueMap = {};

    for (const [name, param] of Object.entries(uniforms)) {
        descriptors.push({ name, type: param.type });

        if (typeof param.value === 'function') {
            if (isWorkerBuiltinUniformName(name) || isLiveUniformName(liveUniforms, programId, name)) {
                continue;
            }
            throw new Error(functionUniformErrorMessage(programId, name));
        }

        const normalized = normalizeCloneSafeUniformValue(param.value);
        if (normalized === null) {
            throw new Error(notCloneSafeErrorMessage(programId, name));
        }
        initialValues[name] = normalized;
    }

    return { descriptors, initialValues };
}

function buildSerializablePass(pass: RenderPass, passIndex: number): SerializableRenderPass {
    let uniforms: Record<string, SerializableRenderPassUniform> | undefined;

    if (pass.uniforms) {
        uniforms = {};
        for (const [name, param] of Object.entries(pass.uniforms)) {
            if (typeof param.value === 'function') {
                if (!isWorkerBuiltinUniformName(name)) {
                    throw new Error(passUniformFunctionErrorMessage(pass.programId, passIndex, name));
                }
                uniforms[name] = { kind: 'builtin', type: param.type };
                continue;
            }
            const normalized = normalizeCloneSafeUniformValue(param.value);
            if (normalized === null) {
                throw new Error(passUniformNotCloneSafeErrorMessage(pass.programId, passIndex, name));
            }
            uniforms[name] = { kind: 'value', type: param.type, value: normalized };
        }
    }

    return {
        programId: pass.programId,
        inputTextures: pass.inputTextures,
        outputFramebuffer: pass.outputFramebuffer,
        uniforms,
        renderOptions: pass.renderOptions
    };
}

export class WorkerBridge {
    private readonly transport: WorkerTransport;
    private readonly callbacks: WorkerBridgeCallbacks;
    private readonly handleMessage = (event: WorkerBridgeMessageEvent<WorkerToMain>): void => {
        this.onMessage(event.data);
    };

    private disposed = false;
    private ready = false;
    private lastActive: boolean;
    private pendingResize: { renderWidth: number; renderHeight: number } | null = null;
    private pendingInvalidateFrames: number | null = null;
    private invalidateScheduled = false;
    private readonly lastPostedValues = new Map<string, UniformValueMap>();

    constructor(transport: WorkerTransport, init: WorkerBridgeInit, callbacks: WorkerBridgeCallbacks = {}) {
        this.transport = transport;
        this.callbacks = callbacks;
        this.lastActive = init.active ?? true;

        if (init.instancing !== undefined) {
            throw new Error(
                'micugl worker: "instancing" is not supported in worker mode (v1). '
                + 'Remove the "instancing" prop or disable "worker" mode on this component.'
            );
        }

        const descriptors: Record<string, UniformDescriptor[]> = {};
        const initialValues: Record<string, UniformValueMap> = {};

        for (const [programId, uniforms] of Object.entries(init.uniforms)) {
            const built = buildProgramDescriptorsAndInitialValues(programId, uniforms, init.liveUniforms);
            descriptors[programId] = built.descriptors;
            initialValues[programId] = built.initialValues;
            this.lastPostedValues.set(programId, { ...built.initialValues });
        }

        const passes = init.passes?.map(buildSerializablePass);

        const config: WorkerInitConfig = {
            programConfigs: init.programConfigs,
            kind: init.kind,
            passes,
            framebuffers: init.framebuffers,
            initialValues,
            descriptors,
            frameloop: init.frameloop,
            speed: init.speed,
            active: this.lastActive,
            contextAttributes: init.contextAttributes
        };

        this.transport.addEventListener('message', this.handleMessage);
        this.transport.postMessage({ type: 'init', canvas: init.canvas, config }, [init.canvas]);
    }

    private post(message: MainToWorker): void {
        this.transport.postMessage(message);
    }

    private onMessage(message: WorkerToMain): void {
        if (this.disposed) {
            return;
        }
        switch (message.type) {
            case 'ready':
                this.ready = true;
                if (this.pendingResize) {
                    this.post({ type: 'resize', ...this.pendingResize });
                    this.pendingResize = null;
                }
                this.callbacks.onReady?.(message.capabilities);
                break;
            case 'contextlost':
                this.callbacks.onContextLost?.();
                break;
            case 'contextrestored':
                this.callbacks.onContextRestored?.();
                break;
            case 'error':
                this.callbacks.onError?.(message.message);
                break;
        }
    }

    setUniformValues(programId: string, values: Record<string, UniformScalar | UniformVector | ArrayBufferView>): void {
        if (this.disposed) {
            return;
        }

        const last = this.lastPostedValues.get(programId) ?? {};
        const diff: UniformValueMap = {};

        for (const [name, rawValue] of Object.entries(values)) {
            const normalized = normalizeCloneSafeUniformValue(rawValue);
            if (normalized === null) {
                throw new Error(notCloneSafeErrorMessage(programId, name));
            }
            if (!uniformValuesEqual(last[name], normalized)) {
                diff[name] = normalized;
            }
        }

        if (Object.keys(diff).length === 0) {
            return;
        }

        this.lastPostedValues.set(programId, { ...last, ...diff });
        this.post({ type: 'setUniformValues', programId, values: diff });
    }

    setPasses(passes: RenderPass[]): void {
        if (this.disposed) {
            return;
        }
        this.post({ type: 'setPasses', passes: passes.map(buildSerializablePass) });
    }

    resize(renderWidth: number, renderHeight: number): void {
        if (this.disposed) {
            return;
        }
        if (!this.ready) {
            this.pendingResize = { renderWidth, renderHeight };
            return;
        }
        this.post({ type: 'resize', renderWidth, renderHeight });
    }

    setActive(active: boolean): void {
        if (this.disposed) {
            return;
        }
        if (active === this.lastActive) {
            return;
        }
        this.lastActive = active;
        this.post({ type: 'setActive', active });
    }

    invalidate(frames?: number): void {
        if (this.disposed) {
            return;
        }

        const requested = frames ?? 1;
        if (!Number.isInteger(requested) || requested < 1) {
            throw new Error(
                'micugl worker: invalidate(frames) requires a positive integer number of frames, received '
                + String(frames)
            );
        }
        this.pendingInvalidateFrames = Math.max(this.pendingInvalidateFrames ?? 0, requested);

        if (this.invalidateScheduled) {
            return;
        }
        this.invalidateScheduled = true;

        queueMicrotask(() => {
            this.invalidateScheduled = false;
            const framesToSend = this.pendingInvalidateFrames;
            this.pendingInvalidateFrames = null;
            if (framesToSend === null || this.disposed) {
                return;
            }
            this.post({ type: 'invalidate', frames: framesToSend });
        });
    }

    setFrameloop(mode: Frameloop): void {
        if (this.disposed) {
            return;
        }
        this.post({ type: 'setFrameloop', mode });
    }

    setSpeed(speed: number): void {
        if (this.disposed) {
            return;
        }
        this.post({ type: 'setSpeed', speed });
    }

    renderFrame(time: number): void {
        if (this.disposed) {
            return;
        }
        this.post({ type: 'renderFrame', time });
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.post({ type: 'dispose' });
        if (this.transport.removeEventListener) {
            this.transport.removeEventListener('message', this.handleMessage);
        }
        if (this.transport.terminate) {
            this.transport.terminate();
        }
    }
}
