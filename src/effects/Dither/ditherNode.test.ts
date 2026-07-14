import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { planGraph } from '@/core/lib/graphPlanning';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type { DitherNodeProps } from '@/effects/Dither/ditherNode';
import { ditherNode } from '@/effects/Dither/ditherNode';
import { ditherGradientConfig, ditherSourceConfig } from '@/effects/Dither/ditherShaders';
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

describe('ditherNode: src selects the sampling variant (T7)', () => {
    it('with src: uses the source config, binds u_src, and carries only the quantization uniforms', () => {
        const src = fakeSource('img');
        const node = ditherNode({ id: 'd', src, levels: 4, scale: 3 });

        expect(node.shaderConfig).toBe(ditherSourceConfig);

        const plan = planGraph(node);
        const pass = plan.passes.find(entry => entry.nodeId === 'd');
        expect(pass?.inputs).toEqual([
            { kind: 'source', sourceId: 'img', samplerName: 'u_src', textureUnit: 0 }
        ]);
        expect(Object.keys(pass?.valueUniforms ?? {}).sort()).toEqual(['u_bayerLevels', 'u_levels', 'u_scale']);
        expect(pass?.valueUniforms.u_colorA).toBeUndefined();
    });

    it('throws when a gradient-only prop rides alongside src, naming the prop', () => {
        const src = fakeSource('img');
        const mixed = { id: 'd', src, speed: 2 } as unknown as DitherNodeProps;

        expect(() => ditherNode(mixed)).toThrow(/ditherNode "speed"[\s\S]*src/);
    });

    it('without src: uses the gradient config, binds no sampler, and accepts colorA/colorB/speed', () => {
        const node = ditherNode({
            id: 'd',
            levels: 4,
            colorA: [0.2, 0.4, 0.6],
            colorB: [0.7, 0.8, 0.9],
            speed: 1.5
        });

        expect(node.shaderConfig).toBe(ditherGradientConfig);

        const plan = planGraph(node);
        const pass = plan.passes.find(entry => entry.nodeId === 'd');
        expect(pass?.inputs).toEqual([]);
        const names = Object.keys(pass?.valueUniforms ?? {});
        expect(names).toContain('u_colorA');
        expect(names).toContain('u_speed');
        expect(pass?.valueUniforms.u_speed).toEqual({ type: 'float', value: 1.5 });
    });
});
