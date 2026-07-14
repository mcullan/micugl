import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { planGraph, shaderNode } from '@/core/lib/graphPlanning';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { blurNode } from '@/effects/Blur/blurNode';
import { blurConfig } from '@/effects/Blur/blurShaders';
import { blurUniforms } from '@/effects/Blur/blurUniforms';
import type { TextureSource } from '@/types';

function fakeSource(id: string): TextureSource {
    return {
        id,
        version: 0,
        options: resolveSourceTextureOptions(),
        getFrame: () => null,
        invalidation: createFrameInvalidation()
    };
}

describe('blurNode: two-node separable shape (T5)', () => {
    it('returns the y node under the user id, feeds it the x node, and both share one program', () => {
        const src = fakeSource('img');
        const node = blurNode({ id: 'blur', src, radius: 5 });

        expect(node.id).toBe('blur');
        expect(node.shaderConfig).toBe(blurConfig);

        const xInput = node.uniforms.u_src;
        expect(typeof xInput).toBe('object');
        expect((xInput as { id: string }).id).toBe('blur-x');
        expect((xInput as { shaderConfig: unknown }).shaderConfig).toBe(blurConfig);

        expect(node.uniforms.u_direction).toEqual({ type: 'vec2', value: Float32Array.from([0, 1]) });
        expect((xInput as { uniforms: Record<string, unknown> }).uniforms.u_direction)
            .toEqual({ type: 'vec2', value: Float32Array.from([1, 0]) });
        expect(node.uniforms.u_radius).toEqual({ type: 'float', value: 5 });

        const plan = planGraph(shaderNode({
            id: 'root',
            shaderConfig: {
                vertexShader: '',
                fragmentShader: '',
                uniforms: [{ name: 'u_tex', type: 'sampler2D' }]
            },
            uniforms: { tex: node }
        }));

        const xPass = plan.passes.find(pass => pass.nodeId === 'blur-x');
        const yPass = plan.passes.find(pass => pass.nodeId === 'blur');
        expect(xPass?.programId).toBe(yPass?.programId);
        expect(Object.keys(plan.programConfigs)).toContain('blur-x');
        expect(Object.keys(plan.programConfigs)).not.toContain('blur');
    });

    it('applies placement dims to both passes so the intermediate matches the output surface', () => {
        const src = fakeSource('img');
        const node = blurNode({ id: 'blur', src, width: 128, height: 64 });

        const root = shaderNode({
            id: 'root',
            shaderConfig: {
                vertexShader: '',
                fragmentShader: '',
                uniforms: [{ name: 'u_tex', type: 'sampler2D' }]
            },
            uniforms: { tex: node }
        });
        const plan = planGraph(root);

        expect(plan.framebuffers['blur-x-out']).toMatchObject({ width: 128, height: 64 });
        expect(plan.framebuffers['blur-out']).toMatchObject({ width: 128, height: 64 });
    });

    it('throws through planGraph when a user node already owns the intermediate id', () => {
        const src = fakeSource('img');
        const collide = shaderNode({
            id: 'blur-x',
            shaderConfig: { vertexShader: '', fragmentShader: '', uniforms: [] },
            uniforms: {},
            width: 8,
            height: 8
        });
        const node = blurNode({ id: 'blur', src });

        const root = shaderNode({
            id: 'root',
            shaderConfig: {
                vertexShader: '',
                fragmentShader: '',
                uniforms: [{ name: 'u_tex', type: 'sampler2D' }, { name: 'u_other', type: 'sampler2D' }]
            },
            uniforms: { tex: node, other: collide }
        });

        expect(() => planGraph(root)).toThrow(/two different nodes share the id "blur-x"/);
    });
});

describe('blurUniforms: radius validation', () => {
    it('accepts radius 0 as a legal identity blur', () => {
        expect(blurUniforms([1, 0], { radius: 0 })).toEqual({
            u_direction: { type: 'vec2', value: Float32Array.from([1, 0]) },
            u_radius: { type: 'float', value: 0 }
        });
    });

    it('throws for a negative radius, naming the value', () => {
        expect(() => blurUniforms([1, 0], { radius: -2 })).toThrow(/"radius"[\s\S]*-2/);
    });

    it('throws for a non-finite radius', () => {
        expect(() => blurUniforms([0, 1], { radius: Number.NaN })).toThrow(/"radius"/);
    });
});
