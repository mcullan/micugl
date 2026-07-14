import { describe, expect, it } from 'vitest';

import type { ShaderNode } from '@/core/lib/graphPlanning';
import { planGraph, shaderNode } from '@/core/lib/graphPlanning';
import type { ShaderProgramConfig, UniformType } from '@/types';

function cfg(uniformNames: Record<string, UniformType> = {}): ShaderProgramConfig {
    return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: Object.entries(uniformNames).map(([name, type]) => ({ name, type }))
    };
}

function wrap(a: ShaderNode, b: ShaderNode): ShaderNode {
    return shaderNode({
        id: 'root',
        shaderConfig: cfg({ u_mix: 'float' }),
        uniforms: { p: a, q: b, mix: { type: 'float', value: 0.5 } }
    });
}

describe('planGraph dedup: two nodes that agree on config, samplers and value keys (T1)', () => {
    it('emits one program config for the pair, points both passes at the canonical, keeps FBOs per node', () => {
        const shared = cfg({ u_k: 'float' });
        const a = shaderNode({
            id: 'a',
            shaderConfig: shared,
            uniforms: { k: { type: 'float', value: 0.25 } },
            width: 16,
            height: 8
        });
        const b = shaderNode({
            id: 'b',
            shaderConfig: shared,
            uniforms: { k: { type: 'float', value: 0.75 } },
            width: 32,
            height: 4
        });

        const plan = planGraph(wrap(a, b));

        expect(Object.keys(plan.programConfigs).sort()).toEqual(['a', 'root']);

        const passA = plan.passes.find(pass => pass.nodeId === 'a');
        const passB = plan.passes.find(pass => pass.nodeId === 'b');
        expect(passA?.programId).toBe('a');
        expect(passB?.programId).toBe('a');

        expect(plan.framebuffers['a-out']).toBeDefined();
        expect(plan.framebuffers['b-out']).toBeDefined();

        expect(passA?.valueUniforms.u_k).toEqual({ type: 'float', value: 0.25 });
        expect(passB?.valueUniforms.u_k).toEqual({ type: 'float', value: 0.75 });
    });
});

describe('planGraph dedup: each matching condition is necessary (T2)', () => {
    it('(a) equal content but distinct config objects stay two programs', () => {
        const a = shaderNode({
            id: 'a',
            shaderConfig: cfg({ u_k: 'float' }),
            uniforms: { k: { type: 'float', value: 0.25 } },
            width: 16,
            height: 8
        });
        const b = shaderNode({
            id: 'b',
            shaderConfig: cfg({ u_k: 'float' }),
            uniforms: { k: { type: 'float', value: 0.75 } },
            width: 32,
            height: 4
        });

        const plan = planGraph(wrap(a, b));

        expect(Object.keys(plan.programConfigs)).toContain('b');
        expect(plan.passes.find(pass => pass.nodeId === 'b')?.programId).toBe('b');
    });

    it('(b) same config object but different sampler names stay two programs', () => {
        const shared = cfg();
        const childA = shaderNode({ id: 'ca', shaderConfig: cfg(), uniforms: {}, width: 8, height: 8 });
        const childB = shaderNode({ id: 'cb', shaderConfig: cfg(), uniforms: {}, width: 8, height: 8 });
        const a = shaderNode({ id: 'a', shaderConfig: shared, uniforms: { srcA: childA }, width: 16, height: 8 });
        const b = shaderNode({ id: 'b', shaderConfig: shared, uniforms: { srcB: childB }, width: 32, height: 4 });

        const plan = planGraph(wrap(a, b));

        expect(Object.keys(plan.programConfigs)).toContain('b');
        expect(plan.passes.find(pass => pass.nodeId === 'b')?.programId).toBe('b');
    });

    it('(c) same config object but node b omits one value uniform stay two programs', () => {
        const shared = cfg({ u_x: 'float', u_y: 'float' });
        const a = shaderNode({
            id: 'a',
            shaderConfig: shared,
            uniforms: { x: { type: 'float', value: 0.25 }, y: { type: 'float', value: 0.5 } },
            width: 16,
            height: 8
        });
        const b = shaderNode({
            id: 'b',
            shaderConfig: shared,
            uniforms: { x: { type: 'float', value: 0.75 } },
            width: 32,
            height: 4
        });

        const plan = planGraph(wrap(a, b));

        expect(Object.keys(plan.programConfigs)).toContain('b');
        expect(plan.passes.find(pass => pass.nodeId === 'b')?.programId).toBe('b');
    });
});

describe('planGraph dedup: state is fresh per call and never leaks across graphs (T2c)', () => {
    it('a second graph reusing the same config object owns its own canonical program', () => {
        const shared = cfg({ u_k: 'float' });

        const first = planGraph(shaderNode({
            id: 'first',
            shaderConfig: shared,
            uniforms: { k: { type: 'float', value: 0.25 } }
        }));
        expect(Object.keys(first.programConfigs)).toEqual(['first']);
        expect(first.passes.find(pass => pass.nodeId === 'first')?.programId).toBe('first');

        const second = planGraph(shaderNode({
            id: 'second',
            shaderConfig: shared,
            uniforms: { k: { type: 'float', value: 0.75 } }
        }));
        expect(Object.keys(second.programConfigs)).toEqual(['second']);
        expect(second.passes.find(pass => pass.nodeId === 'second')?.programId).toBe('second');
    });
});
