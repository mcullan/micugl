import { describe, expect, it } from 'vitest';

import { planGraph, shaderNode } from '@/core/lib/graphPlanning';
import { graphStructureKey } from '@/react/lib/graphKeys';
import type { ShaderProgramConfig, UniformType } from '@/types';

function cfg(uniformNames: Record<string, UniformType> = {}): ShaderProgramConfig {
    return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: Object.entries(uniformNames).map(([name, type]) => ({ name, type }))
    };
}

describe('graphStructureKey: passKey folds programId (T4)', () => {
    it('changes when a pass programId changes and nothing else does', () => {
        const child = shaderNode({
            id: 'child',
            shaderConfig: cfg({ u_gain: 'float' }),
            uniforms: { gain: { type: 'float', value: 0.375 } },
            width: 16,
            height: 8
        });
        const root = shaderNode({
            id: 'root',
            shaderConfig: cfg({ u_mix: 'float' }),
            uniforms: { tex: child, mix: { type: 'float', value: 0.875 } }
        });

        const plan = planGraph(root);
        const baseline = graphStructureKey(plan);

        const rewired = {
            ...plan,
            passes: plan.passes.map((pass, index) =>
                index === 0 ? { ...pass, programId: `${pass.programId}-alt` } : pass)
        };

        expect(graphStructureKey(rewired)).not.toBe(baseline);
    });
});
