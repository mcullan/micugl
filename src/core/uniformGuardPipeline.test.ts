import { describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { UNIFORM_COMPONENTS } from '@/core/lib/uniformComponents';
import { uploadCallFor } from '@/core/lib/uniformReflection';
import { vec3 } from '@/core/lib/vectorUtils';
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
    declarePingPongSampler,
    DEFAULT_FRAMEBUFFER_OPTIONS,
    DEFAULT_RENDER_OPTIONS
} from '@/react/lib/pingPongPasses';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createCanvasStub, createGLStub } from '@/testing';
import type {
    RenderPass,
    ShaderProgramConfig,
    UniformParam,
    UniformType,
    UniformUpdaterDef
} from '@/types';
import type { WorkerToMain } from '@/worker/protocol';
import type { WorkerRuntimeHost } from '@/worker/WorkerRuntime';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

const PROGRAM_ID = 'guard';
const WIDTH = 320;
const HEIGHT = 200;

const FBO_CONFIG: Partial<GLStubConfig> = {
    extensions: { OES_texture_float: true, OES_texture_float_linear: true },
    renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
};

function realUpdaters(uniforms: Record<string, UniformParam>, skipDefaults: boolean): UniformUpdaterDef[] {
    const parsed = parseUniformStructureKey(uniformStructureKey(uniformDescriptors(uniforms), skipDefaults));
    const valuesRef = { current: collectLiveValues(uniforms) };
    const runtime = createTransitionRuntime(() => false);
    return buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime);
}

function register(
    manager: WebGLManager,
    updaters: UniformUpdaterDef[]
): void {
    updaters.forEach(updater => {
        manager.registerUniformUpdater(PROGRAM_ID, updater.name, updater.type, updater.updateFn);
    });
}

function build(
    config: ShaderProgramConfig,
    activeUniforms: Record<string, UniformType>,
    stubConfig: Partial<GLStubConfig> = {}
): { manager: WebGLManager; stub: GLStubHandle } {
    const stub = createCanvasStub({ ...stubConfig, activeUniforms });
    const manager = new WebGLManager(stub.canvas);
    manager.createProgram(PROGRAM_ID, config);
    manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);
    return { manager, stub };
}

function uploadsOf(stub: GLStubHandle, name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    if (location === null) {
        return [];
    }
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function uploadCallsOf(stub: GLStubHandle, name: string): string[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.name);
}

function readable(value: unknown): unknown {
    return value instanceof Float32Array ? Array.from(value) : value;
}

describe('the GL call each uniform type is uploaded with', () => {
    it('is the one the reflection table compares against, for every type WebGLManager can upload', () => {
        const types = Object.keys(UNIFORM_COMPONENTS) as UniformType[];
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: Object.fromEntries(types.map(type => [`u_${type}`, type]))
        });
        const { manager, stub } = build(
            config,
            Object.fromEntries(types.map(type => [`u_${type}`, type]))
        );

        types.forEach(type => {
            const components = UNIFORM_COMPONENTS[type];
            const value = components === 1 ? 1 : new Float32Array(components);
            manager.registerUniformUpdater(PROGRAM_ID, `u_${type}`, type, () => value as never);
        });

        stub.reset();
        manager.updateUniforms(PROGRAM_ID, 0);

        types.forEach(type => {
            expect(uploadCallsOf(stub, `u_${type}`)).toEqual([uploadCallFor(type)]);
        });
    });
});

describe('an updater for a uniform the program never declared', () => {
    it('throws at registration instead of uploading nothing forever', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_swirl: 'float' }
        });
        const { manager } = build(config, { u_time: 'float', u_resolution: 'vec2', u_swirl: 'float' });

        const updaters = realUpdaters({ swirl: { type: 'float', value: 1 } }, true);
        expect(() => { register(manager, updaters) }).not.toThrow();

        const undeclared = realUpdaters({ glow: { type: 'float', value: 1 } }, true);
        expect(() => { register(manager, undeclared) })
            .toThrow(/Uniform "u_glow".*never declared.*createShaderConfig/s);
    });

    it('names the audio band uniform when useAudioUniforms is wired to an undeclared name', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_audioLevel: 'float' }
        });
        const { manager } = build(config, {
            u_time: 'float',
            u_resolution: 'vec2',
            u_audioLevel: 'float'
        });

        const updaters = realUpdaters({
            u_audioBands: { type: 'vec4', value: () => new Float32Array([0, 0, 0, 0]) as never },
            u_audioLevel: { type: 'float', value: 0 }
        }, true);

        expect(() => { register(manager, updaters) }).toThrow(/Uniform "u_audioBands"/);
    });
});

describe('an updater whose type disagrees with the GLSL type', () => {
    it('throws at registration, naming the GLSL type and the uploaded type', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_audioBands: 'vec3' }
        });
        const { manager } = build(config, {
            u_time: 'float',
            u_resolution: 'vec2',
            u_audioBands: 'vec3'
        });

        const updaters = realUpdaters({
            u_audioBands: { type: 'vec4', value: () => new Float32Array([0, 0, 0, 0]) as never }
        }, true);

        expect(() => { register(manager, updaters) })
            .toThrow(/Uniform "u_audioBands".*is a vec3 in the shader source.*uploaded as a vec4/s);
    });

    it('accepts the same uniform once the uploaded type matches the GLSL type, and the value reaches GL', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_audioBands: 'vec3' }
        });
        const { manager, stub } = build(config, {
            u_time: 'float',
            u_resolution: 'vec2',
            u_audioBands: 'vec3'
        });

        const updaters = realUpdaters({
            u_audioBands: { type: 'vec3', value: vec3([0.25, 0.5, 0.75]) }
        }, true);

        expect(() => { register(manager, updaters) }).not.toThrow();

        stub.reset();
        manager.updateUniforms(PROGRAM_ID, 0);

        expect(uploadsOf(stub, 'u_audioBands').map(readable)).toEqual([[0.25, 0.5, 0.75]]);
    });

    it('lets an int through to a sampler2D, because gl.uniform1i is how WebGL sets a sampler', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'int' }
        });
        const { manager, stub } = build(config, {
            u_time: 'float',
            u_texture0: 'sampler2D'
        });

        const updaters = realUpdaters({ u_texture0: { type: 'int', value: 0 } }, true);
        expect(() => { register(manager, updaters) }).not.toThrow();

        stub.reset();
        manager.updateUniforms(PROGRAM_ID, 0);

        expect(uploadCallsOf(stub, 'u_texture0')).toEqual(['uniform1i']);
        expect(uploadsOf(stub, 'u_texture0')).toEqual([0]);
    });
});

describe('a createShaderConfig type that disagrees with the shader source', () => {
    it('throws when the program is created, before anything can be uploaded to it', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_audioBands: 'vec4' }
        });

        expect(() => build(config, { u_time: 'float', u_audioBands: 'vec3' }))
            .toThrow(/Uniform "u_audioBands".*is a vec3 in the shader source.*declare it as a vec4/s);
    });

    it('is silent for a uniform the shader optimized out, which has no GLSL type to disagree with', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_unused: 'vec4' }
        });

        expect(() => build(config, { u_time: 'float' })).not.toThrow();
    });
});

describe('a uniform the GLSL compiler optimized out', () => {
    it('is still skipped silently, and every uniform the shader does keep still uploads its value', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_swirl: 'float', u_color: 'vec3', u_unused: 'float' }
        });
        const { manager, stub } = build(config, {
            u_time: 'float',
            u_swirl: 'float',
            u_color: 'vec3'
        });

        const updaters = realUpdaters({
            u_swirl: { type: 'float', value: 3 },
            u_color: { type: 'vec3', value: vec3([1, 0, 0]) },
            u_unused: { type: 'float', value: 9 }
        }, false);

        expect(updaters.map(updater => updater.name).sort())
            .toEqual(['u_color', 'u_resolution', 'u_swirl', 'u_time', 'u_unused']);

        expect(() => { register(manager, updaters) }).not.toThrow();

        stub.reset();
        manager.updateUniforms(PROGRAM_ID, 16);

        expect(uploadsOf(stub, 'u_swirl')).toEqual([3]);
        expect(uploadsOf(stub, 'u_color').map(readable)).toEqual([[1, 0, 0]]);
        expect(uploadsOf(stub, 'u_time')).toEqual([0.016]);

        expect(stub.uniformCalls.some(call => call.location === null)).toBe(false);
        expect(stub.uniformCalls).toHaveLength(3);
    });
});

describe('worker mode, where a throw from inside the rAF callback would kill the loop for the session', () => {
    function initWorker(
        config: ShaderProgramConfig,
        activeUniforms: Record<string, UniformType>,
        uniforms: Record<string, UniformParam>
    ): { posted: WorkerToMain[]; framesRun: () => number; scheduled: () => number } {
        const stub = createGLStub({ activeUniforms });
        const canvas = {
            width: WIDTH,
            height: HEIGHT,
            getContext: (): WebGLRenderingContext => stub.gl,
            addEventListener: (): void => undefined,
            removeEventListener: (): void => undefined
        } as unknown as OffscreenCanvas;

        const callbacks: ((now: number) => void)[] = [];
        let framesRun = 0;
        const posted: WorkerToMain[] = [];

        const host: WorkerRuntimeHost = {
            postMessage: message => { posted.push(message) },
            requestAnimationFrame: callback => {
                callbacks.push((now: number) => { framesRun += 1; callback(now) });
                return callbacks.length;
            },
            cancelAnimationFrame: () => undefined,
            now: () => 0
        };

        const descriptors = uniformDescriptors(uniforms);
        const runtime = new WorkerRuntime(host);

        runtime.handleMessage({
            type: 'init',
            canvas,
            config: {
                kind: 'single',
                programConfigs: { [PROGRAM_ID]: config },
                descriptors: { [PROGRAM_ID]: descriptors },
                initialValues: {
                    [PROGRAM_ID]: Object.fromEntries(
                        descriptors.map(descriptor => [descriptor.name, descriptor.type === 'float' ? 1 : [0, 0, 0]])
                    )
                },
                skipDefaultUniforms: false,
                frameloop: 'always',
                speed: 1,
                active: true
            }
        });

        return { posted, framesRun: () => framesRun, scheduled: () => callbacks.length };
    }

    it('reports an undeclared uniform from "init", before a single frame is ever scheduled', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_level: 'float' }
        });

        const worker = initWorker(
            config,
            { u_time: 'float', u_resolution: 'vec2', u_level: 'float' },
            { u_glow: { type: 'float', value: 1 } }
        );

        const errors = worker.posted.filter(message => message.type === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            message: expect.stringMatching(/Uniform "u_glow".*never declared/s) as string
        });

        expect(worker.posted.some(message => message.type === 'ready')).toBe(false);
        expect(worker.scheduled()).toBe(0);
        expect(worker.framesRun()).toBe(0);
    });

    it('still reaches "ready" and schedules frames when every uniform is declared', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_level: 'float' }
        });

        const worker = initWorker(
            config,
            { u_time: 'float', u_resolution: 'vec2', u_level: 'float' },
            { u_level: { type: 'float', value: 1 } }
        );

        expect(worker.posted.filter(message => message.type === 'error')).toEqual([]);
        expect(worker.posted.some(message => message.type === 'ready')).toBe(true);
        expect(worker.scheduled()).toBe(1);
    });
});

describe('the main-thread ping-pong pass path, which uploads through setUniform and never registers an updater', () => {
    function pingPongPasses(uniforms: Record<string, UniformParam>): ReturnType<typeof buildPasses> {
        return buildPasses(
            PROGRAM_ID,
            undefined,
            1,
            { [PROGRAM_ID]: realUpdaters(uniforms, false) },
            {},
            DEFAULT_FRAMEBUFFER_OPTIONS,
            DEFAULT_RENDER_OPTIONS,
            undefined
        );
    }

    function run(
        config: ShaderProgramConfig,
        activeUniforms: Record<string, UniformType>,
        uniforms: Record<string, UniformParam>,
        customPasses?: RenderPass[]
    ): { execute: () => void; stub: GLStubHandle } {
        const { manager, stub } = build(config, activeUniforms, FBO_CONFIG);
        const built = pingPongPasses(uniforms);
        const passes = customPasses ?? built.passes;

        for (const [id, options] of Object.entries(built.framebuffers)) {
            manager.fbo.createFramebuffer(id, { ...options, width: WIDTH, height: HEIGHT });
        }

        const passSystem = new Passes(manager);
        for (const pass of passes) {
            passSystem.addPass(pass);
        }
        passSystem.initializeResources();

        return { execute: () => { passSystem.execute(0) }, stub };
    }

    const ACTIVE = {
        u_time: 'float',
        u_texture0: 'sampler2D',
        u_intensity: 'float'
    } as const;

    it('throws when a pass uniform was never declared, at pass build time and not from inside the frame loop', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D' }
        });

        expect(() => run(config, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } }))
            .toThrow(/Uniform "u_intensity".*never declared/s);
    });

    it('throws when a pass uniform is uploaded as the wrong type, at pass build time', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D', u_intensity: 'float' }
        });

        expect(() => run(
            config,
            ACTIVE,
            { u_intensity: { type: 'vec3', value: vec3([1, 0, 0]) } }
        )).toThrow(/Uniform "u_intensity".*is a float in the shader source.*uploaded as a vec3/s);
    });

    it('throws for the sampler name of a custom pass the shader never declared, so a typo cannot ship dead', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D', u_intensity: 'float' }
        });

        const custom: RenderPass[] = [{
            programId: PROGRAM_ID,
            inputTextures: [{
                id: `${PROGRAM_ID}-fb-a`,
                textureUnit: 0,
                bindingType: 'read',
                samplerName: 'u_pervious'
            }],
            outputFramebuffer: null,
            uniforms: {}
        }];

        expect(() => run(config, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } }, custom))
            .toThrow(/Uniform "u_pervious".*never declared/s);
    });

    it('throws for a pass whose program was never created, instead of skipping the pass silently', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D', u_intensity: 'float' }
        });

        const custom: RenderPass[] = [{
            programId: 'never-created',
            inputTextures: [],
            outputFramebuffer: null,
            uniforms: {}
        }];

        expect(() => run(config, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } }, custom))
            .toThrow(/Program with id never-created not found/);
    });

    it('throws for a sampler named after an Object.prototype member, which is a legal GLSL identifier', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D', u_intensity: 'float' }
        });

        const custom: RenderPass[] = [{
            programId: PROGRAM_ID,
            inputTextures: [{
                id: `${PROGRAM_ID}-fb-a`,
                textureUnit: 0,
                bindingType: 'read',
                samplerName: 'valueOf'
            }],
            outputFramebuffer: null,
            uniforms: {}
        }];

        expect(() => run(config, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } }, custom))
            .toThrow(/Uniform "valueOf".*never declared/s);
    });

    it('lets a fully declared chain through, including a u_resolution the shader optimized out', () => {
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_texture0: 'sampler2D', u_intensity: 'float' }
        });

        const { execute, stub } = run(config, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } });

        stub.reset();
        execute();

        expect(stub.calls.filter(call => call.name === 'drawArrays')).toHaveLength(3);
        expect(uploadsOf(stub, 'u_intensity')).toEqual([0.5, 0.5, 0.5]);
        expect(uploadsOf(stub, 'u_texture0')).toEqual([0, 0]);
        expect(uploadsOf(stub, 'u_time')).toEqual([0, 0, 0]);
        expect(uploadsOf(stub, 'u_resolution')).toEqual([]);
        expect(stub.uniformCalls.some(call => call.location === null)).toBe(false);
    });

    it('declares the sampler it invents itself, so a user shader config that never names it still uploads it', () => {
        const userConfig = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_intensity: 'float' }
        });

        expect(userConfig.uniforms.map(uniform => uniform.name)).not.toContain('u_texture0');

        const [engineConfig] = Object.values(declarePingPongSampler({ [PROGRAM_ID]: userConfig }));

        const { execute, stub } = run(engineConfig, ACTIVE, { u_intensity: { type: 'float', value: 0.5 } });

        stub.reset();
        execute();

        expect(uploadCallsOf(stub, 'u_texture0')).toEqual(['uniform1i', 'uniform1i']);
        expect(uploadsOf(stub, 'u_texture0')).toEqual([0, 0]);
    });
});
