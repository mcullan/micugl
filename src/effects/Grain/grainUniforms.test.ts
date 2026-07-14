import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core';
import { grainUniforms } from '@/effects/Grain/grainUniforms';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam, Vec3 } from '@/types';

const fakeAudio = (uniforms: Record<string, UniformParam>): AudioUniformsResult => ({
    uniforms,
    start: () => Promise.resolve(),
    stop: () => undefined,
    status: 'running',
    error: null
});

describe('grainUniforms: defaults', () => {
    it('produces the exact uniform record for default props', () => {
        const uniforms = grainUniforms();

        expect(Object.keys(uniforms).sort()).toEqual([
            'u_audioLevel',
            'u_audioStrength',
            'u_color',
            'u_grainColor',
            'u_intensity',
            'u_scale',
            'u_speed'
        ]);

        expect(uniforms.u_color).toEqual({ type: 'vec3', value: new Float32Array([0, 0, 0]) });
        expect(uniforms.u_grainColor).toEqual({ type: 'vec3', value: new Float32Array([1, 1, 1]) });
        expect(uniforms.u_intensity).toEqual({ type: 'float', value: 0.08 });
        expect(uniforms.u_scale).toEqual({ type: 'float', value: 2 });
        expect(uniforms.u_speed).toEqual({ type: 'float', value: 1 });
        expect(uniforms.u_audioLevel).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_audioStrength).toEqual({ type: 'float', value: 0 });
    });
});

describe('grainUniforms: prop mapping', () => {
    it('lands each documented prop in its uniform, with vec3 conversion for colors', () => {
        const color: Vec3 = [0.12, 0.34, 0.56];
        const grainColor: Vec3 = [0.98, 0.76, 0.54];
        const uniforms = grainUniforms({ color, grainColor, intensity: 0.5, scale: 6, speed: 2.5 });

        expect(uniforms.u_color.value).toBeInstanceOf(Float32Array);
        expect(uniforms.u_color.value).toEqual(new Float32Array([0.12, 0.34, 0.56]));
        expect(uniforms.u_grainColor.value).toEqual(new Float32Array([0.98, 0.76, 0.54]));
        expect(uniforms.u_intensity.value).toBe(0.5);
        expect(uniforms.u_scale.value).toBe(6);
        expect(uniforms.u_speed.value).toBe(2.5);
    });

    it('throws with the offending prop named when a number is not finite', () => {
        expect(() => grainUniforms({ intensity: Number.POSITIVE_INFINITY })).toThrow(/"intensity".*finite/s);
    });

    it('throws when a color tuple has the wrong length', () => {
        expect(() => grainUniforms({ color: [0.1, 0.2] as unknown as Vec3 })).toThrow(/"color".*3-number tuple/s);
    });

    it('throws with "scale" named for zero and negative scale', () => {
        expect(() => grainUniforms({ scale: 0 })).toThrow(/"scale".*greater than 0/s);
        expect(() => grainUniforms({ scale: -2 })).toThrow(/"scale".*greater than 0/s);
    });

    it('passes a sub-pixel scale through without clamping', () => {
        expect(grainUniforms({ scale: 0.5 }).u_scale.value).toBe(0.5);
    });
});

describe('grainUniforms: audio passthrough', () => {
    it('with audio absent: u_audioLevel is a literal 0 with no invalidation or nonReproducible', () => {
        const uniforms = grainUniforms();

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

        const uniforms = grainUniforms({ audio, audioStrength: 2 });

        expect(uniforms.u_audioLevel).toBe(level);
        expect(uniforms.u_audioStrength).toEqual({ type: 'float', value: 2 });
    });

    it('throws for a non-finite audioStrength even with audio absent', () => {
        expect(() => grainUniforms({ audioStrength: Number.NaN })).toThrow(/"audioStrength".*finite/s);
    });

    it('throws with an actionable message when the audio result has no u_audioLevel key', () => {
        const audio = fakeAudio({ level: { type: 'float', value: 0 } });

        expect(() => grainUniforms({ audio })).toThrow(/u_audioLevel.*default uniform names/s);
    });
});
