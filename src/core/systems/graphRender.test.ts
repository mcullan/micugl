import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { GL_TEXTURE0 } from '@/core/lib/glConstants';
import type { ShaderNode } from '@/core/lib/graphPlanning';
import { planGraph, shaderNode, toRenderPasses } from '@/core/lib/graphPlanning';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import type { CanvasStubHandle, GLStubConfig } from '@/testing';
import { createCanvasStub } from '@/testing';
import type { RenderPass, ShaderProgramConfig, TextureSource, TextureUploadSource, UniformType } from '@/types';

type UniformsFor = (nodeId: string) => RenderPass['uniforms'];

function gcfg(uniformNames: Record<string, UniformType> = {}): ShaderProgramConfig {
    return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: Object.entries(uniformNames).map(([name, type]) => ({ name, type })),
        attributes: [{ name: 'a_position', size: 2, type: 'FLOAT', normalized: false, stride: 0, offset: 0 }]
    };
}

const f32 = (values: number[]): Float32Array => new Float32Array(values);

const bitmap = (width: number, height: number): TextureUploadSource =>
    ({ width, height }) as unknown as TextureUploadSource;

interface SourceHandle {
    source: TextureSource;
    push: (frame: TextureUploadSource) => void;
}

function createSource(id: string): SourceHandle {
    let frame: TextureUploadSource | null = null;
    let version = 0;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(),
        getFrame: () => frame,
        invalidation: createFrameInvalidation()
    };

    return {
        source,
        push: (next: TextureUploadSource) => {
            frame = next;
            version += 1;
        }
    };
}

interface GraphSetup {
    stub: CanvasStubHandle;
    manager: WebGLManager;
    passSystem: Passes;
    plan: ReturnType<typeof planGraph>;
}

interface GraphSetupOptions {
    uniformsFor?: UniformsFor;
    stubConfig?: GLStubConfig;
    sources?: TextureSource[];
    defineSources?: boolean;
    initialize?: boolean;
}

function setupGraph(root: ShaderNode, options: GraphSetupOptions = {}): GraphSetup {
    const stub = createCanvasStub(options.stubConfig);
    const manager = new WebGLManager(stub.canvas);
    const plan = planGraph(root);

    for (const node of plan.order) {
        manager.createProgram(node.id, plan.programConfigs[node.id]);
    }
    for (const [id, framebufferOptions] of Object.entries(plan.framebuffers)) {
        manager.fbo.createFramebuffer(id, framebufferOptions);
    }
    if (options.defineSources !== false) {
        for (const source of options.sources ?? plan.sources) {
            manager.textures.defineTexture(source);
        }
    }

    const passSystem = new Passes(manager);
    const uniformsFor: UniformsFor = options.uniformsFor ?? (() => ({}));
    for (const pass of toRenderPasses(plan, uniformsFor)) {
        passSystem.addPass(pass);
    }
    if (options.initialize !== false) {
        passSystem.initializeResources();
    }

    return { stub, manager, passSystem, plan };
}

function location(manager: WebGLManager, programId: string, name: string): WebGLUniformLocation | null {
    return manager.resources.get(programId)?.uniforms[name] ?? null;
}

describe('graph render: end-to-end honesty (T14 anchor)', () => {
    it('draws a source-fed chain in topological order, advancing per-node uniforms and uploading the frame', () => {
        const image = createSource('img');
        const phaseName = (id: string): string => `u_phase_${id}`;
        const uniformsFor: UniformsFor = id =>
            ({ [phaseName(id)]: { type: 'float', value: (time: number) => time } });

        const leaf = shaderNode({ id: 'L', shaderConfig: gcfg({ u_phase_L: 'float' }), uniforms: { img: image.source } });
        const mid = shaderNode({ id: 'M', shaderConfig: gcfg({ u_phase_M: 'float' }), uniforms: { tex: leaf }, width: 4, height: 4 });
        const root = shaderNode({ id: 'R', shaderConfig: gcfg({ u_phase_R: 'float' }), uniforms: { tex: mid } });

        const { stub, manager, passSystem } = setupGraph(root, { uniformsFor });

        image.push(bitmap(4, 4));
        stub.reset();

        passSystem.execute(1);

        const programs = ['L', 'M', 'R'].map(id => manager.resources.get(id)?.program);
        expect(stub.useProgramCalls.slice(0, 3)).toEqual(programs);

        const frameAllocations = stub.texImage2DCalls.filter(call => call.source === image.source.getFrame());
        expect(frameAllocations).toHaveLength(1);
        expect(frameAllocations[0]).toMatchObject({ width: 4, height: 4 });

        const samplerLoc = location(manager, 'L', 'u_img');
        const samplerUploads = stub.uniformCalls.filter(
            call => call.name === 'uniform1i' && call.location === samplerLoc
        );
        expect(samplerUploads.map(call => call.value)).toEqual([0]);

        passSystem.execute(2);

        for (const id of ['L', 'M', 'R']) {
            const phaseLoc = location(manager, id, phaseName(id));
            const values = stub.uniformCalls
                .filter(call => call.name === 'uniform1f' && call.location === phaseLoc)
                .map(call => call.value);
            expect(values).toEqual([1, 2]);
        }
    });
});

describe('graph render: source upload gating (T15)', () => {
    it('uploads on the first frame, skips while the version holds, and re-uploads once it advances', () => {
        const image = createSource('img');
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { img: image.source } });

        const { stub, passSystem } = setupGraph(root);

        image.push(bitmap(4, 4));
        stub.reset();

        passSystem.execute(1);
        expect(stub.texImage2DCalls).toHaveLength(1);
        expect(stub.texSubImage2DCalls).toHaveLength(0);

        passSystem.execute(2);
        expect(stub.texImage2DCalls).toHaveLength(1);
        expect(stub.texSubImage2DCalls).toHaveLength(0);
        expect(stub.calls.filter(call => call.name === 'drawArrays')).toHaveLength(2);

        image.push(bitmap(4, 4));
        passSystem.execute(3);
        expect(stub.texSubImage2DCalls).toHaveLength(1);
        expect(stub.texSubImage2DCalls[0]).toMatchObject({ width: 4, height: 4 });
    });
});

describe('graph render: one source feeding two nodes (T16)', () => {
    it('defines it once, uploads once per version, and binds it at each pass own unit', () => {
        const image = createSource('img');
        const mid = shaderNode({ id: 'M', shaderConfig: gcfg(), uniforms: { img: image.source }, width: 4, height: 4 });
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { tex: mid, img: image.source } });

        const { stub, plan, passSystem } = setupGraph(root);

        expect(plan.sources).toHaveLength(1);

        image.push(bitmap(4, 4));
        stub.reset();

        passSystem.execute(1);

        expect(stub.texImage2DCalls).toHaveLength(1);
        expect(stub.texSubImage2DCalls).toHaveLength(0);

        const bindPairs: { unit: unknown; tex: unknown }[] = [];
        let currentUnit: unknown;
        for (const call of stub.calls) {
            if (call.name === 'activeTexture') {
                currentUnit = call.args[0];
            }
            if (call.name === 'bindTexture') {
                bindPairs.push({ unit: currentUnit, tex: call.args[1] });
            }
        }

        const atUnitOne = bindPairs.find(pair => pair.unit === GL_TEXTURE0 + 1);
        expect(atUnitOne).toBeDefined();
        const sourceTexture = atUnitOne?.tex;
        const atUnitZero = bindPairs.filter(pair => pair.tex === sourceTexture && pair.unit === GL_TEXTURE0);
        expect(atUnitZero.length).toBeGreaterThanOrEqual(1);
    });
});

describe('graph render: per-pass output dimensions (T17)', () => {
    it('feeds each pass its output surface size to both pass-uniform fns and registered updaters', () => {
        const mid = shaderNode({
            id: 'M',
            shaderConfig: gcfg({ u_probe_m: 'vec2', u_res: 'vec2' }),
            uniforms: {},
            width: 16,
            height: 8
        });
        const root = shaderNode({ id: 'R', shaderConfig: gcfg({ u_probe_r: 'vec2' }), uniforms: { tex: mid } });

        const probeFn = (_t: number, width: number, height: number): never => f32([width, height]) as never;
        const uniformsFor: UniformsFor = (nodeId): RenderPass['uniforms'] => {
            if (nodeId === 'M') {
                return { u_probe_m: { type: 'vec2', value: probeFn } };
            }
            return { u_probe_r: { type: 'vec2', value: probeFn } };
        };

        const { stub, manager, passSystem } = setupGraph(root, { uniformsFor });

        manager.registerUniformUpdater('M', 'u_res', 'vec2', (_t, width, height) => f32([width ?? 0, height ?? 0]) as never);

        stub.reset();
        passSystem.execute(1);

        const probeValue = (programId: string, name: string): number[] => {
            const loc = location(manager, programId, name);
            const call = stub.uniformCalls.find(entry => entry.name === 'uniform2fv' && entry.location === loc);
            return Array.from(call?.value as Float32Array);
        };

        expect(probeValue('M', 'u_probe_m')).toEqual([16, 8]);
        expect(probeValue('R', 'u_probe_r')).toEqual([300, 150]);

        const resLoc = location(manager, 'M', 'u_res');
        const resCall = stub.uniformCalls.find(entry => entry.name === 'uniform2fv' && entry.location === resLoc);
        expect(Array.from(resCall?.value as Float32Array)).toEqual([16, 8]);
    });
});

describe('graph render: capture path keeps explicit dims (T18)', () => {
    it('feeds renderFinalPassTo target dims to the final pass uniforms, not the canvas size', () => {
        const leaf = shaderNode({ id: 'L', shaderConfig: gcfg(), uniforms: {}, width: 4, height: 4 });
        const root = shaderNode({ id: 'R', shaderConfig: gcfg({ u_probe: 'vec2' }), uniforms: { tex: leaf } });

        const uniformsFor: UniformsFor = (nodeId): RenderPass['uniforms'] => {
            if (nodeId === 'R') {
                return { u_probe: { type: 'vec2', value: (_t: number, width: number, height: number) => f32([width, height]) as never } };
            }
            return {};
        };

        const { stub, manager, passSystem } = setupGraph(root, { uniformsFor });
        manager.fbo.createFramebuffer('scratch', { width: 20, height: 10, textureCount: 1 });

        stub.reset();
        passSystem.renderFinalPassTo('scratch', 20, 10, 5);

        const loc = location(manager, 'R', 'u_probe');
        const call = stub.uniformCalls.find(entry => entry.name === 'uniform2fv' && entry.location === loc);
        expect(Array.from(call?.value as Float32Array)).toEqual([20, 10]);
    });
});

describe('graph render: single-texture swap degeneration (T19)', () => {
    it('keeps the read index pinned at 0 for a textureCount-1 graph framebuffer across frames', () => {
        const leaf = shaderNode({ id: 'L', shaderConfig: gcfg(), uniforms: {}, width: 4, height: 4 });
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { tex: leaf } });

        const { manager, passSystem } = setupGraph(root);

        expect(manager.fbo.getTextureCount('L-out')).toBe(1);

        passSystem.execute(1);
        expect(manager.fbo.getReadIndex('L-out')).toBe(0);

        passSystem.execute(2);
        expect(manager.fbo.getReadIndex('L-out')).toBe(0);
    });
});

describe('graph render: source with a null sampler location (T20)', () => {
    it('throws at initializeResources naming the sampler and program, and repeatably with no ghost state', () => {
        const image = createSource('img');
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { img: image.source } });

        const { passSystem } = setupGraph(root, {
            stubConfig: { activeUniforms: { u_time: 'float' } },
            initialize: false
        });

        expect(() => { passSystem.initializeResources() }).toThrow(/never samples "u_img"/);
        expect(() => { passSystem.initializeResources() }).toThrow(/program "R"/);
    });

    it('recovers on the same passSystem once the throwing cause is fixed, with no ghost state', () => {
        const image = createSource('img');
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { img: image.source } });

        const { manager, passSystem } = setupGraph(root, {
            stubConfig: { activeUniforms: { u_img: 'sampler2D' } },
            defineSources: false,
            initialize: false
        });

        expect(() => { passSystem.initializeResources() }).toThrow(/defineTexture/);

        manager.textures.defineTexture(image.source);

        expect(() => { passSystem.initializeResources() }).not.toThrow();
    });
});

describe('graph render: undefined source texture (T21)', () => {
    it('throws at initializeResources with the defineTexture remedy when the source was never defined', () => {
        const image = createSource('img');
        const root = shaderNode({ id: 'R', shaderConfig: gcfg(), uniforms: { img: image.source } });

        expect(() => setupGraph(root, { defineSources: false })).toThrow(/defineTexture/);
        expect(() => setupGraph(root, { defineSources: false })).toThrow(/"img"/);
    });
});

describe('graph render: shared program, per-pass values (T22)', () => {
    it('uploads each pass own uniform value before its own draw', () => {
        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram('blur', {
            vertexShader: '',
            fragmentShader: '',
            uniforms: [{ name: 'u_dir', type: 'vec2' }, { name: 'u_texture0', type: 'sampler2D' }],
            attributes: [{ name: 'a_position', size: 2, type: 'FLOAT', normalized: false, stride: 0, offset: 0 }]
        });
        manager.fbo.createFramebuffer('fb-a', { width: 4, height: 4, textureCount: 1 });
        manager.fbo.createFramebuffer('fb-b', { width: 4, height: 4, textureCount: 1 });

        const passSystem = new Passes(manager);
        passSystem.addPass({
            programId: 'blur',
            inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }],
            outputFramebuffer: 'fb-b',
            uniforms: { u_dir: { type: 'vec2', value: f32([1, 0]) as never } }
        });
        passSystem.addPass({
            programId: 'blur',
            inputTextures: [{ id: 'fb-b', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }],
            outputFramebuffer: null,
            uniforms: { u_dir: { type: 'vec2', value: f32([0, 1]) as never } }
        });
        passSystem.initializeResources();

        stub.reset();
        passSystem.execute(0);

        const dirLoc = manager.resources.get('blur')?.uniforms.u_dir;
        const timeline = stub.calls
            .filter(call =>
                (call.name === 'uniform2fv' && call.args[0] === dirLoc)
                || call.name === 'drawArrays')
            .map(call => call.name === 'drawArrays' ? 'draw' : Array.from(call.args[1] as Float32Array));

        expect(timeline).toEqual([[1, 0], 'draw', [0, 1], 'draw']);
    });
});

describe('graph render: single-program texture-binding boundary (T24)', () => {
    it('still throws the prepareRender guard for a program with registered source-texture bindings', () => {
        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram('img', gcfg({ u_image: 'sampler2D' }));

        const image = createSource('u_image');
        manager.registerTextureBinding('img', { unit: 0, samplerName: 'u_image', source: image.source });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'img', inputTextures: [], outputFramebuffer: null });
        passSystem.initializeResources();

        expect(() => { passSystem.execute(0) }).toThrow(/source-texture bindings/);
    });
});
