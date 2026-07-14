import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core';
import {
    MESH_GRADIENT_DEFAULT_COLORS,
    meshGradientUniforms
} from '@/effects/MeshGradient/meshGradientUniforms';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam, Vec3 } from '@/types';

const fakeAudio = (uniforms: Record<string, UniformParam>): AudioUniformsResult => ({
    uniforms,
    start: () => Promise.resolve(),
    stop: () => undefined,
    status: 'running',
    error: null
});

describe('meshGradientUniforms: defaults', () => {
    it('produces the exact uniform record for default props', () => {
        const uniforms = meshGradientUniforms();

        expect(Object.keys(uniforms).sort()).toEqual([
            'u_audioLevel',
            'u_audioStrength',
            'u_color0',
            'u_color1',
            'u_color2',
            'u_color3',
            'u_colorCount',
            'u_seed',
            'u_speed',
            'u_warp',
            'u_warpScale'
        ]);

        expect(uniforms.u_color0).toEqual({ type: 'vec3', value: new Float32Array(MESH_GRADIENT_DEFAULT_COLORS[0]) });
        expect(uniforms.u_color3).toEqual({ type: 'vec3', value: new Float32Array(MESH_GRADIENT_DEFAULT_COLORS[3]) });
        expect(uniforms.u_colorCount).toEqual({ type: 'float', value: 4 });
        expect(uniforms.u_speed).toEqual({ type: 'float', value: 0.2 });
        expect(uniforms.u_warp).toEqual({ type: 'float', value: 0.6 });
        expect(uniforms.u_warpScale).toEqual({ type: 'float', value: 1.2 });
        expect(uniforms.u_seed).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_audioLevel).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_audioStrength).toEqual({ type: 'float', value: 0 });
    });
});

describe('meshGradientUniforms: prop mapping', () => {
    it('lands each documented prop in its uniform, with vec3 conversion for colors', () => {
        const colors: Vec3[] = [[0.11, 0.22, 0.33], [0.44, 0.55, 0.66]];
        const uniforms = meshGradientUniforms({
            colors,
            speed: 0.9,
            warp: 0.25,
            warpScale: 3.5,
            seed: 7
        });

        expect(uniforms.u_color0.value).toBeInstanceOf(Float32Array);
        expect(uniforms.u_color0.value).toEqual(new Float32Array([0.11, 0.22, 0.33]));
        expect(uniforms.u_color1.value).toEqual(new Float32Array([0.44, 0.55, 0.66]));
        expect(uniforms.u_color2.value).toEqual(new Float32Array([0.44, 0.55, 0.66]));
        expect(uniforms.u_colorCount.value).toBe(2);
        expect(uniforms.u_speed.value).toBe(0.9);
        expect(uniforms.u_warp.value).toBe(0.25);
        expect(uniforms.u_warpScale.value).toBe(3.5);
        expect(uniforms.u_seed.value).toBe(7);
    });

    it('throws with the offending prop named when a number is not finite', () => {
        expect(() => meshGradientUniforms({ warp: Number.NaN })).toThrow(/"warp".*finite/s);
    });

    it('throws when colors is outside 2 to 4', () => {
        expect(() => meshGradientUniforms({ colors: [[0, 0, 0]] })).toThrow(/"colors".*between 2 and 4/s);
    });
});

describe('meshGradientUniforms: audio passthrough', () => {
    it('with audio absent: u_audioLevel is a literal 0 with no invalidation or nonReproducible', () => {
        const uniforms = meshGradientUniforms();

        expect(uniforms.u_audioLevel).toEqual({ type: 'float', value: 0 });
        expect('invalidation' in uniforms.u_audioLevel).toBe(false);
        expect('nonReproducible' in uniforms.u_audioLevel).toBe(false);
        expect(uniforms.u_audioStrength.value).toBe(0);
    });

    it('with audio present: forwards the exact u_audioLevel param object and maps strength', () => {
        const level: UniformParam = {
            type: 'float',
            value: () => 0.5,
            invalidation: createFrameInvalidation(),
            nonReproducible: () => true
        };
        const audio = fakeAudio({ u_audioLevel: level });

        const uniforms = meshGradientUniforms({ audio, audioStrength: 0.75 });

        expect(uniforms.u_audioLevel).toBe(level);
        expect(uniforms.u_audioStrength).toEqual({ type: 'float', value: 0.75 });
    });

    it('throws with an actionable message when the audio result has no u_audioLevel key', () => {
        const audio = fakeAudio({ level: { type: 'float', value: 0 } });

        expect(() => meshGradientUniforms({ audio })).toThrow(/u_audioLevel.*default uniform names/s);
    });
});
