import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { GL_LINEAR, GL_NEAREST } from '@/core/lib/glConstants';
import type { GraphUniformValue } from '@/core/lib/graphPlanning';
import { isShaderNode, planGraph, shaderNode, toRenderPasses } from '@/core/lib/graphPlanning';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type { ShaderProgramConfig, TextureSource, UniformParam, UniformType } from '@/types';

function cfg(uniformNames: Record<string, UniformType> = {}): ShaderProgramConfig {
    return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: Object.entries(uniformNames).map(([name, type]) => ({ name, type }))
    };
}

function fakeSource(id: string): TextureSource {
    return {
        id,
        version: 0,
        options: resolveSourceTextureOptions(),
        getFrame: () => null,
        invalidation: createFrameInvalidation()
    };
}

describe('planGraph: order', () => {
    it('emits a linear chain in post-order, leaf before parent, pass order = execution order', () => {
        const leaf = shaderNode({ id: 'leaf', shaderConfig: cfg(), uniforms: {} });
        const mid = shaderNode({ id: 'mid', shaderConfig: cfg(), uniforms: { tex: leaf } });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { tex: mid } });

        const plan = planGraph(root);

        expect(plan.order.map(node => node.id)).toEqual(['leaf', 'mid', 'root']);
        expect(plan.passes.map(pass => pass.nodeId)).toEqual(['leaf', 'mid', 'root']);
    });

    it('plans a shared child once and both parents bind its framebuffer', () => {
        const shared = shaderNode({ id: 'shared', shaderConfig: cfg(), uniforms: {} });
        const left = shaderNode({ id: 'left', shaderConfig: cfg(), uniforms: { tex: shared } });
        const right = shaderNode({ id: 'right', shaderConfig: cfg(), uniforms: { tex: shared } });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { a: left, b: right } });

        const plan = planGraph(root);

        expect(plan.passes.filter(pass => pass.nodeId === 'shared')).toHaveLength(1);
        expect(Object.keys(plan.framebuffers).filter(id => id === 'shared-out')).toHaveLength(1);

        const leftPass = plan.passes.find(pass => pass.nodeId === 'left');
        const rightPass = plan.passes.find(pass => pass.nodeId === 'right');
        expect(leftPass?.inputs).toEqual([{ kind: 'node', childId: 'shared', samplerName: 'u_tex', textureUnit: 0 }]);
        expect(rightPass?.inputs).toEqual([{ kind: 'node', childId: 'shared', samplerName: 'u_tex', textureUnit: 0 }]);
    });
});

describe('planGraph: malformed graphs', () => {
    it('throws with the full path when a cycle is built by mutation', () => {
        const nodeA = shaderNode({ id: 'a', shaderConfig: cfg(), uniforms: {} });
        const nodeB = shaderNode({ id: 'b', shaderConfig: cfg(), uniforms: { tex: nodeA } });
        nodeA.uniforms.loop = nodeB;

        expect(() => planGraph(nodeA)).toThrow(/a -> b -> a/);
    });

    it('throws for two different node objects with the same id, but treats the same object twice as a diamond', () => {
        const first = shaderNode({ id: 'x', shaderConfig: cfg(), uniforms: {} });
        const second = shaderNode({ id: 'x', shaderConfig: cfg(), uniforms: {} });
        const collide = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { a: first, b: second } });

        expect(() => planGraph(collide)).toThrow(/two different nodes share the id "x"/);

        const same = shaderNode({ id: 'y', shaderConfig: cfg(), uniforms: {} });
        const diamond = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { a: same, b: same } });
        expect(() => planGraph(diamond)).not.toThrow();
    });

    it('throws when a uniform value is neither a param, a node, nor a source, naming node and uniform', () => {
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { bad: 42 as unknown as GraphUniformValue }
        });

        expect(() => planGraph(root)).toThrow(/node "root"/);
        expect(() => planGraph(root)).toThrow(/uniform "bad"/);
    });

    it('throws naming node and uniform when a uniform value is null, not a raw type error', () => {
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { hook: null as unknown as GraphUniformValue }
        });

        expect(() => planGraph(root)).toThrow(/node "root"/);
        expect(() => planGraph(root)).toThrow(/uniform "hook"/);
    });

    it('throws naming node and uniform when a uniform value is undefined, not a raw type error', () => {
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { hook: undefined as unknown as GraphUniformValue }
        });

        expect(() => planGraph(root)).toThrow(/node "root"/);
        expect(() => planGraph(root)).toThrow(/uniform "hook"/);
    });
});

describe('planGraph: framebuffers and root', () => {
    it('gives the root a null output framebuffer and throws if the root is sized', () => {
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: {} });
        expect(planGraph(root).passes[0].outputFramebufferId).toBeNull();

        const sizedRoot = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: {}, width: 10, height: 10 });
        expect(() => planGraph(sizedRoot)).toThrow(/root node "root" declares width\/height/);
    });

    it('allocates a single-texture framebuffer per non-root node, defaulting size to 0 and filters to LINEAR', () => {
        const leaf = shaderNode({ id: 'leaf', shaderConfig: cfg(), uniforms: {} });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { tex: leaf } });

        expect(planGraph(root).framebuffers['leaf-out']).toEqual({
            width: 0,
            height: 0,
            textureCount: 1,
            textureOptions: { minFilter: GL_LINEAR, magFilter: GL_LINEAR }
        });

        const sized = shaderNode({
            id: 'sized',
            shaderConfig: cfg(),
            uniforms: {},
            width: 16,
            height: 8,
            textureOptions: { minFilter: GL_NEAREST }
        });
        const rootWithSized = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { tex: sized } });

        expect(planGraph(rootWithSized).framebuffers['sized-out']).toEqual({
            width: 16,
            height: 8,
            textureCount: 1,
            textureOptions: { minFilter: GL_NEAREST }
        });
    });
});

describe('planGraph: texture units', () => {
    it('assigns units 0..n-1 in declaration order across mixed node and source inputs', () => {
        const first = shaderNode({ id: 'c1', shaderConfig: cfg(), uniforms: {} });
        const second = shaderNode({ id: 'c2', shaderConfig: cfg(), uniforms: {} });
        const source = fakeSource('s1');
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { a: first, b: source, c: second }
        });

        const rootPass = planGraph(root).passes.find(pass => pass.nodeId === 'root');
        expect(rootPass?.inputs).toEqual([
            { kind: 'node', childId: 'c1', samplerName: 'u_a', textureUnit: 0 },
            { kind: 'source', sourceId: 's1', samplerName: 'u_b', textureUnit: 1 },
            { kind: 'node', childId: 'c2', samplerName: 'u_c', textureUnit: 2 }
        ]);
    });

    it('throws with the count when a node binds past the unit limit, and honours maxTextureUnits', () => {
        const uniforms: Record<string, GraphUniformValue> = {};
        for (let index = 0; index < 9; index++) {
            uniforms[`t${index}`] = fakeSource(`s${index}`);
        }
        const tooMany = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms });
        expect(() => planGraph(tooMany)).toThrow(/binds 9 texture inputs, past the limit of 8/);

        const three = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { a: fakeSource('a'), b: fakeSource('b'), c: fakeSource('c') }
        });
        expect(() => planGraph(three, { maxTextureUnits: 2 })).toThrow(/binds 3 texture inputs, past the limit of 2/);
    });
});

describe('planGraph: sampler names', () => {
    it('normalizes a bare uniform key into a sampler name', () => {
        const child = shaderNode({ id: 'c', shaderConfig: cfg(), uniforms: {} });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { src: child } });

        const rootPass = planGraph(root).passes.find(pass => pass.nodeId === 'root');
        expect(rootPass?.inputs[0].samplerName).toBe('u_src');
    });

    it('throws when two texture inputs normalize to the same sampler name', () => {
        const first = shaderNode({ id: 'c1', shaderConfig: cfg(), uniforms: {} });
        const second = shaderNode({ id: 'c2', shaderConfig: cfg(), uniforms: {} });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { tex: first, u_tex: second } });

        expect(() => planGraph(root)).toThrow(/both resolve to sampler "u_tex"/);
    });

    it('throws when a sampler name collides with one of the node value-uniform names', () => {
        const child = shaderNode({ id: 'c', shaderConfig: cfg(), uniforms: {} });
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { mix: child, u_mix: { type: 'float', value: 0 } }
        });

        expect(() => planGraph(root)).toThrow(/for both a texture sampler and a value/);
    });

    it('throws when two value uniforms normalize to the same name', () => {
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_k: 'float' }),
            uniforms: { k: { type: 'float', value: 1 }, u_k: { type: 'float', value: 2 } }
        });

        expect(() => planGraph(root)).toThrow(/two value uniforms that both resolve to "u_k"/);
    });
});

describe('planGraph: sources', () => {
    it('dedupes the same source object across nodes and throws for two objects sharing an id', () => {
        const source = fakeSource('img');
        const left = shaderNode({ id: 'left', shaderConfig: cfg(), uniforms: { img: source } });
        const right = shaderNode({ id: 'right', shaderConfig: cfg(), uniforms: { img: source } });
        const root = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { a: left, b: right } });

        const plan = planGraph(root);
        expect(plan.sources).toHaveLength(1);
        expect(plan.sources[0]).toBe(source);

        const one = fakeSource('img');
        const two = fakeSource('img');
        const leftClash = shaderNode({ id: 'left', shaderConfig: cfg(), uniforms: { img: one } });
        const rightClash = shaderNode({ id: 'right', shaderConfig: cfg(), uniforms: { img: two } });
        const rootClash = shaderNode({ id: 'root', shaderConfig: cfg(), uniforms: { a: leftClash, b: rightClash } });

        expect(() => planGraph(rootClash)).toThrow(/different source object already claims that id/);
    });
});

describe('planGraph: program configs', () => {
    it('auto-declares samplers for edges and sources without duplicating an existing declaration', () => {
        const child = shaderNode({ id: 'c', shaderConfig: cfg(), uniforms: {} });
        const source = fakeSource('img');
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_tex: 'sampler2D' }),
            uniforms: { tex: child, img: source }
        });

        const rootConfig = planGraph(root).programConfigs.root;
        const names = rootConfig.uniforms.map(uniform => uniform.name);

        expect(names).toContain('u_tex');
        expect(names).toContain('u_img');
        expect(rootConfig.uniforms.find(uniform => uniform.name === 'u_img')).toEqual({
            name: 'u_img',
            type: 'sampler2D'
        });
        expect(rootConfig.uniforms.filter(uniform => uniform.name === 'u_tex')).toHaveLength(1);
    });
});

describe('planGraph: topology', () => {
    it('emits a topology whose nodes, edges, sources, dims and uniform names match the built plan', () => {
        const source = fakeSource('img');
        const leaf = shaderNode({
            id: 'leaf',
            shaderConfig: cfg(),
            uniforms: { img: source },
            width: 16,
            height: 8
        });
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_k: 'float' }),
            uniforms: { tex: leaf, k: { type: 'float', value: 1 } }
        });

        const plan = planGraph(root);

        expect(plan.topology.rootId).toBe('root');

        const topoIds = plan.topology.nodes.map(topoNode => topoNode.id).sort();
        expect(topoIds).toEqual(plan.order.map(node => node.id).sort());
        expect(topoIds).toEqual(plan.passes.map(pass => pass.nodeId).sort());

        const topoById = new Map(plan.topology.nodes.map(topoNode => [topoNode.id, topoNode]));

        expect(topoById.get('leaf')).toEqual({
            id: 'leaf',
            framebufferId: 'leaf-out',
            width: 16,
            height: 8,
            edges: [],
            sources: [{ samplerName: 'u_img', sourceId: 'img' }],
            uniformNames: []
        });

        expect(topoById.get('root')).toEqual({
            id: 'root',
            framebufferId: null,
            width: 0,
            height: 0,
            edges: [{ samplerName: 'u_tex', childId: 'leaf' }],
            sources: [],
            uniformNames: ['u_k']
        });

        for (const topoNode of plan.topology.nodes) {
            const pass = plan.passes.find(candidate => candidate.nodeId === topoNode.id);
            expect(topoNode.framebufferId).toBe(pass?.outputFramebufferId);
        }
    });
});

describe('toRenderPasses', () => {
    it('maps edges to read bindings, sources to source bindings, and injects per-node uniforms', () => {
        const source = fakeSource('img');
        const leaf = shaderNode({ id: 'leaf', shaderConfig: cfg(), uniforms: { img: source } });
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg(),
            uniforms: { tex: leaf },
            renderOptions: { clear: false }
        });

        const plan = planGraph(root);
        const valueById: Record<string, number> = { leaf: 11, root: 22 };
        const uniformsFor = (nodeId: string): Record<string, { type: UniformType; value: number }> =>
            ({ u_k: { type: 'float', value: valueById[nodeId] } });
        const passes = toRenderPasses(plan, uniformsFor);

        expect(passes[0].inputTextures).toEqual([
            { id: 'img', textureUnit: 0, bindingType: 'source', samplerName: 'u_img' }
        ]);
        expect(passes[0].outputFramebuffer).toBe('leaf-out');
        expect(passes[0].uniforms).toEqual({ u_k: { type: 'float', value: 11 } });
        expect(passes[0].renderOptions).toEqual({ clear: true });

        expect(passes[1].inputTextures).toEqual([
            { id: 'leaf-out', textureUnit: 0, bindingType: 'node', samplerName: 'u_tex' }
        ]);
        expect(passes[1].outputFramebuffer).toBeNull();
        expect(passes[1].uniforms).toEqual({ u_k: { type: 'float', value: 22 } });
        expect(passes[1].renderOptions).toEqual({ clear: false });
    });
});

describe('isShaderNode', () => {
    it('recognizes shader nodes and rejects params and sources', () => {
        const node = shaderNode({ id: 'n', shaderConfig: cfg(), uniforms: {} });
        expect(isShaderNode(node)).toBe(true);
        expect(isShaderNode({ type: 'float', value: 0 })).toBe(false);
        expect(isShaderNode(fakeSource('s'))).toBe(false);
    });
});

describe('planGraph: valueUniforms', () => {
    it('keeps only the params of a node that mixes a param, a child node and a source, under normalized names', () => {
        const image = fakeSource('img');
        const leaf = shaderNode({ id: 'leaf', shaderConfig: cfg(), uniforms: {} });
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_gain: 'float' }),
            uniforms: {
                tex: leaf,
                img: image,
                gain: { type: 'float', value: 0.375 }
            }
        });

        const plan = planGraph(root);
        const rootPass = plan.passes.find(pass => pass.nodeId === 'root');

        expect(rootPass?.valueUniforms).toEqual({ u_gain: { type: 'float', value: 0.375 } });
        expect(plan.passes.find(pass => pass.nodeId === 'leaf')?.valueUniforms).toEqual({});
    });

    it('carries the very param object through, so a transition and an invalidation survive planning', () => {
        const invalidation = createFrameInvalidation();
        const param: UniformParam = {
            type: 'float',
            value: 0.5,
            invalidation,
            transition: { duration: 120 }
        };
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_level: 'float' }),
            uniforms: { level: param }
        });

        const plan = planGraph(root);

        expect(plan.passes[0].valueUniforms.u_level).toBe(param);
    });
});
