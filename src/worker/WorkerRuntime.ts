import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import { UNIFORM_COMPONENTS } from '@/core/lib/uniformComponents';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import { singleProgramEntry } from '@/react/lib/contentKeys';
import { createCommonUpdaters } from '@/react/lib/createUniformUpdater';
import { RenderLoop } from '@/react/lib/renderLoop';
import { msToFrame } from '@/react/lib/timeKeeper';
import type {
    FramebufferOptions,
    RenderPass,
    RenderPassUniformValue,
    UniformType,
    UniformUpdateFn,
    UniformUpdaterDef,
    WebGLExtensionName
} from '@/types';
import type {
    MainToWorker,
    SerializableRenderPass,
    UniformScalar,
    UniformValueMap,
    UniformVector,
    WorkerCapabilities,
    WorkerInitConfig,
    WorkerToMain
} from '@/worker/protocol';
import { isWorkerBuiltinUniformName } from '@/worker/protocol';

export interface WorkerRuntimeHost {
    postMessage: (message: WorkerToMain) => void;
    requestAnimationFrame: (callback: (now: number) => void) => number;
    cancelAnimationFrame: (handle: number) => void;
    now: () => number;
    close?: () => void;
}

const PROBED_EXTENSIONS: WebGLExtensionName[] = [
    'OES_texture_float',
    'OES_texture_float_linear',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'ANGLE_instanced_arrays'
];

const QUAD_VERTICES = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function describeValue(value: UniformScalar | UniformVector): string {
    return typeof value === 'number' ? 'a single number' : `${String(value.length)} components`;
}

function assertUniformComponents(
    label: string,
    programId: string,
    name: string,
    type: UniformType,
    value: UniformScalar | UniformVector
): void {
    const components = UNIFORM_COMPONENTS[type];

    if (components === 1) {
        if (typeof value !== 'number') {
            throw new Error(
                `micugl worker: ${label} "${name}" on program "${programId}" is a "${type}" and expects a `
                + `single number, received ${describeValue(value)}`
            );
        }
        return;
    }

    if (typeof value === 'number' || value.length !== components) {
        throw new Error(
            `micugl worker: ${label} "${name}" on program "${programId}" is a "${type}" and expects `
            + `${String(components)} components, received ${describeValue(value)}`
        );
    }
}

export class WorkerRuntime {
    private readonly host: WorkerRuntimeHost;

    private canvas: OffscreenCanvas | null = null;
    private config: WorkerInitConfig | null = null;
    private manager: WebGLManager | null = null;
    private passSystem: Passes | null = null;
    private loop: RenderLoop | null = null;
    private programId: string | null = null;

    private readonly values = new Map<string, UniformValueMap>();
    private readonly uniformTypes = new Map<string, Map<string, UniformType>>();
    private readonly registered = new Map<string, Set<string>>();

    private renderWidth = 0;
    private renderHeight = 0;
    private pendingFrames = 0;
    private pendingFrameKind: InvalidationKind = 'discrete';
    private active = false;
    private contextLost = false;
    private failed = false;
    private disposed = false;

    constructor(host: WorkerRuntimeHost) {
        this.host = host;
    }

    handleMessage(message: MainToWorker): void {
        if (this.disposed) {
            return;
        }
        if (this.failed && message.type !== 'dispose') {
            return;
        }
        try {
            this.dispatch(message);
        } catch (error) {
            this.fail(error);
        }
    }

    private dispatch(message: MainToWorker): void {
        if (message.type === 'dispose') {
            this.dispose();
            return;
        }

        if (message.type === 'init') {
            this.init(message.canvas, message.config);
            return;
        }

        const loop = this.requireLoop(message.type);

        switch (message.type) {
            case 'setUniformValues':
                this.setUniformValues(message.programId, message.values);
                break;
            case 'setPasses':
                this.setPasses(message.passes);
                break;
            case 'resize':
                this.applySize(message.renderWidth, message.renderHeight);
                break;
            case 'setActive':
                this.setActive(loop, message.active);
                break;
            case 'invalidate':
                this.invalidate(loop, message.frames, message.kind);
                break;
            case 'setFrameloop':
                loop.setFrameloop(message.mode);
                break;
            case 'setSpeed':
                loop.setSpeed(message.speed);
                break;
            case 'setMotionGate':
                loop.setMotionGate(message.gate);
                break;
            case 'renderFrame':
                loop.setFrame(msToFrame(message.time));
                break;
        }
    }

    private init(canvas: OffscreenCanvas, config: WorkerInitConfig): void {
        if (this.canvas) {
            throw new Error(
                'micugl worker: received a second "init" message; one worker runtime drives exactly one canvas'
            );
        }

        this.canvas = canvas;
        this.config = config;
        this.renderWidth = canvas.width;
        this.renderHeight = canvas.height;

        canvas.addEventListener('webglcontextlost', this.onContextLost);
        canvas.addEventListener('webglcontextrestored', this.onContextRestored);

        this.seedUniformState(config);
        this.build();

        this.loop = new RenderLoop({
            requestAnimationFrame: callback => this.host.requestAnimationFrame(callback),
            cancelAnimationFrame: handle => { this.host.cancelAnimationFrame(handle) },
            now: () => this.host.now(),
            render: this.renderTick,
            frameloop: config.frameloop,
            speed: config.speed,
            pauseWhenHidden: false
        });

        this.active = config.active;
        if (config.active) {
            this.loop.start();
        }

        this.host.postMessage({ type: 'ready', capabilities: this.readCapabilities() });
    }

    private seedUniformState(config: WorkerInitConfig): void {
        for (const [programId, descriptors] of Object.entries(config.descriptors)) {
            this.uniformTypes.set(
                programId,
                new Map(descriptors.map(descriptor => [descriptor.name, descriptor.type]))
            );
        }

        for (const [programId, values] of Object.entries(config.initialValues)) {
            const store: UniformValueMap = {};
            for (const [name, value] of Object.entries(values)) {
                this.validateUniformValue(programId, name, value);
                store[name] = value;
            }
            this.values.set(programId, store);
        }
    }

    private build(): void {
        const canvas = this.canvas;
        const config = this.config;
        if (!canvas || !config) {
            throw new Error('micugl worker: cannot build GL resources before "init"');
        }

        this.destroyManager();

        const manager = new WebGLManager(canvas, config.contextAttributes);
        if (manager.context.isContextLost()) {
            throw new Error('micugl worker: the WebGL context is lost; cannot create shader programs');
        }

        this.manager = manager;
        this.passSystem = null;
        this.programId = null;
        this.registered.clear();

        for (const [programId, programConfig] of Object.entries(config.programConfigs)) {
            manager.createProgram(programId, programConfig);
        }

        if (config.kind === 'single') {
            const [programId] = singleProgramEntry(config.programConfigs);
            manager.createBuffer(programId, 'a_position', QUAD_VERTICES);
            manager.setAttributeOnce(programId, 'a_position', {
                name: 'a_position',
                size: 2,
                type: 'FLOAT',
                normalized: false,
                stride: 0,
                offset: 0
            });
            this.programId = programId;
        } else {
            this.createFramebuffers(manager, config.framebuffers);
            this.buildPasses(manager, config.passes ?? []);
        }

        this.registerUniformUpdaters(manager);
        this.applySize(this.renderWidth, this.renderHeight);
    }

    private createFramebuffers(
        manager: WebGLManager,
        framebuffers: Record<string, FramebufferOptions> | undefined
    ): void {
        for (const [id, options] of Object.entries(framebuffers ?? {})) {
            manager.fbo.createFramebuffer(id, {
                ...options,
                width: options.width || this.renderWidth,
                height: options.height || this.renderHeight
            });
        }
    }

    private buildPasses(manager: WebGLManager, passes: SerializableRenderPass[]): void {
        const passSystem = new Passes(manager);
        for (const pass of passes) {
            passSystem.addPass(this.toRenderPass(pass));
        }
        passSystem.initializeResources();
        this.passSystem = passSystem;
    }

    private toRenderPass(pass: SerializableRenderPass): RenderPass {
        let uniforms: RenderPass['uniforms'];

        if (pass.uniforms) {
            uniforms = {};
            for (const [name, uniform] of Object.entries(pass.uniforms)) {
                if (uniform.kind === 'builtin') {
                    const builtin = this.builtinUpdater(name, pass.programId);
                    uniforms[name] = {
                        type: builtin.type,
                        value: builtin.updateFn as RenderPassUniformValue
                    };
                    continue;
                }
                uniforms[name] = {
                    type: uniform.type,
                    value: toPassUniformValue(pass.programId, name, uniform.type, uniform.value)
                };
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

    private builtinUpdater(name: string, programId: string): UniformUpdaterDef {
        const builtin = createCommonUpdaters().find(def => def.name === name);
        if (!builtin) {
            throw new Error(
                `micugl worker: uniform "${name}" on program "${programId}" was sent as a worker built-in, `
                + 'but the worker computes no built-in with that name'
            );
        }
        return builtin;
    }

    private registerUniformUpdaters(manager: WebGLManager): void {
        const config = this.requireConfig();

        if (!config.skipDefaultUniforms) {
            for (const [programId, programConfig] of Object.entries(config.programConfigs)) {
                for (const uniform of programConfig.uniforms) {
                    const hasPostedValue = this.values.get(programId)?.[uniform.name] !== undefined;
                    if (isWorkerBuiltinUniformName(uniform.name) && !hasPostedValue) {
                        this.ensureBuiltinUpdater(manager, programId, uniform.name);
                    }
                }
            }
        }

        for (const [programId, values] of this.values) {
            for (const name of Object.keys(values)) {
                this.ensureValueUpdater(manager, programId, name);
            }
        }
    }

    private markRegistered(programId: string, name: string): void {
        const names = this.registered.get(programId) ?? new Set<string>();
        names.add(name);
        this.registered.set(programId, names);
    }

    private isRegistered(programId: string, name: string): boolean {
        return this.registered.get(programId)?.has(name) ?? false;
    }

    private ensureBuiltinUpdater(manager: WebGLManager, programId: string, name: string): void {
        if (this.isRegistered(programId, name)) {
            return;
        }

        const builtin = this.builtinUpdater(name, programId);
        manager.registerUniformUpdater(programId, name, builtin.type, builtin.updateFn);
        this.markRegistered(programId, name);
    }

    private ensureValueUpdater(manager: WebGLManager, programId: string, name: string): void {
        if (this.isRegistered(programId, name)) {
            return;
        }

        const type = this.uniformType(programId, name);
        manager.registerUniformUpdater(programId, name, type, this.createValueUpdater(programId, name));
        this.markRegistered(programId, name);
    }

    private createValueUpdater(programId: string, name: string): UniformUpdateFn<UniformType> {
        const read = (): UniformScalar | UniformVector | undefined => this.values.get(programId)?.[name];
        return read as UniformUpdateFn<UniformType>;
    }

    private uniformType(programId: string, name: string): UniformType {
        const types = this.uniformTypes.get(programId);
        if (!types) {
            throw new Error(
                `micugl worker: received uniform values for unknown program "${programId}". Programs are fixed `
                + 'at init; the main thread must not post values for a program it did not declare.'
            );
        }

        const type = types.get(name);
        if (!type) {
            throw new Error(
                `micugl worker: received a value for uniform "${name}" on program "${programId}", which was not `
                + 'declared at init. Worker-mode uniforms must be declared up front so the worker knows their type.'
            );
        }
        return type;
    }

    private validateUniformValue(
        programId: string,
        name: string,
        value: UniformScalar | UniformVector
    ): void {
        assertUniformComponents('uniform', programId, name, this.uniformType(programId, name), value);
    }

    private setUniformValues(programId: string, values: UniformValueMap): void {
        const manager = this.requireManager('setUniformValues');
        const store = this.values.get(programId) ?? {};

        for (const [name, value] of Object.entries(values)) {
            this.validateUniformValue(programId, name, value);
            store[name] = value;
        }

        this.values.set(programId, store);

        for (const name of Object.keys(values)) {
            this.ensureValueUpdater(manager, programId, name);
        }
    }

    private setPasses(passes: SerializableRenderPass[]): void {
        const manager = this.requireManager('setPasses');
        const config = this.requireConfig();
        const passSystem = this.passSystem;

        if (!passSystem) {
            throw new Error(
                'micugl worker: received "setPasses" but this worker was initialized in "single" mode; '
                + 'render passes require kind: "pingpong"'
            );
        }

        config.passes = passes;

        passSystem.clearPasses();
        for (const pass of passes) {
            passSystem.addPass(this.toRenderPass(pass));
        }
        passSystem.initializeResources();
        this.registerUniformUpdaters(manager);
        this.loop?.invalidate();
    }

    private applySize(renderWidth: number, renderHeight: number): void {
        const manager = this.requireManager('resize');
        const config = this.requireConfig();

        this.renderWidth = renderWidth;
        this.renderHeight = renderHeight;

        manager.setDrawingBufferSize(renderWidth, renderHeight);
        manager.fbo.setCanvasViewport(renderWidth, renderHeight);

        for (const [id, options] of Object.entries(config.framebuffers ?? {})) {
            manager.fbo.resizeFramebuffer(
                id,
                options.width || renderWidth,
                options.height || renderHeight
            );
        }

        this.loop?.invalidate();
    }

    private setActive(loop: RenderLoop, active: boolean): void {
        this.active = active;

        if (!active) {
            loop.stop();
            return;
        }

        if (!this.contextLost) {
            loop.start();
        }
    }

    private invalidate(loop: RenderLoop, frames: number | undefined, kind: InvalidationKind = 'discrete'): void {
        const requested = frames ?? 1;
        if (!Number.isInteger(requested) || requested < 1) {
            throw new Error(
                'micugl worker: invalidate(frames) requires a positive integer number of frames, received '
                + String(frames)
            );
        }

        this.pendingFrames = Math.max(this.pendingFrames, requested);
        this.pendingFrameKind = kind;
        loop.invalidate(kind);
    }

    private readonly renderTick = (elapsed: number): void => {
        try {
            if (this.draw(elapsed)) {
                this.consumePendingFrame();
            }
        } catch (error) {
            this.fail(error);
        }
    };

    private consumePendingFrame(): void {
        if (this.pendingFrames === 0) {
            return;
        }

        this.pendingFrames -= 1;
        if (this.pendingFrames > 0) {
            this.loop?.invalidate(this.pendingFrameKind);
        }
    }

    private draw(timeMs: number): boolean {
        if (this.contextLost) {
            return false;
        }

        const manager = this.requireManager('render');
        const config = this.requireConfig();

        if (config.kind === 'pingpong') {
            const passSystem = this.passSystem;
            if (!passSystem) {
                throw new Error('micugl worker: no pass system was built for this "pingpong" worker');
            }
            passSystem.execute(timeMs);
            return true;
        }

        const programId = this.programId;
        if (!programId) {
            throw new Error('micugl worker: no program was built for this "single" worker');
        }

        manager.fastRender(programId, timeMs, config.renderOptions?.clear);
        const gl = manager.context;
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
    }

    private readonly onContextLost = (event: Event): void => {
        if (this.failed) {
            return;
        }
        event.preventDefault();
        this.contextLost = true;
        this.loop?.stop();
        this.host.postMessage({ type: 'contextlost' });
    };

    private readonly onContextRestored = (): void => {
        if (this.failed) {
            return;
        }
        try {
            this.contextLost = false;
            this.build();
            this.host.postMessage({ type: 'contextrestored' });
            if (this.active) {
                this.loop?.start();
            }
        } catch (error) {
            this.fail(error);
        }
    };

    private readCapabilities(): WorkerCapabilities {
        const manager = this.requireManager('ready');
        const gl = manager.context;

        return {
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
            extensions: PROBED_EXTENSIONS.filter(name => manager.getExtension(name) !== null)
        };
    }

    private dispose(): void {
        this.disposed = true;
        this.loop?.stop();
        this.loop = null;

        this.canvas?.removeEventListener('webglcontextlost', this.onContextLost);
        this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored);

        this.destroyManager();
        this.passSystem = null;

        this.host.close?.();
    }

    private destroyManager(): void {
        const manager = this.manager;
        this.manager = null;

        if (manager && !manager.context.isContextLost()) {
            manager.destroyAll();
        }
    }

    private fail(error: unknown): void {
        this.failed = true;
        this.loop?.stop();
        this.host.postMessage({ type: 'error', message: errorMessage(error) });
    }

    private requireLoop(messageType: string): RenderLoop {
        const loop = this.loop;
        if (!loop) {
            throw new Error(`micugl worker: received "${messageType}" before "init"`);
        }
        return loop;
    }

    private requireManager(messageType: string): WebGLManager {
        const manager = this.manager;
        if (!manager) {
            throw new Error(`micugl worker: received "${messageType}" before the GL context was created`);
        }
        return manager;
    }

    private requireConfig(): WorkerInitConfig {
        const config = this.config;
        if (!config) {
            throw new Error('micugl worker: the init config is missing');
        }
        return config;
    }
}

function toPassUniformValue(
    programId: string,
    name: string,
    type: UniformType,
    value: UniformScalar | UniformVector
): RenderPassUniformValue {
    assertUniformComponents('pass uniform', programId, name, type, value);

    if (typeof value === 'number') {
        return value;
    }

    return new Float32Array(value) as RenderPassUniformValue;
}
