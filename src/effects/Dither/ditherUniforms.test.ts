import { describe, expect, it } from 'vitest';

import { ditherGradientUniforms, ditherQuantizeUniforms } from '@/effects/Dither/ditherUniforms';

describe('ditherQuantizeUniforms: levels, matrixLevels and scale', () => {
    it('defaults to levels 3, matrixLevels 3 and scale 1', () => {
        expect(ditherQuantizeUniforms()).toEqual({
            u_levels: { type: 'float', value: 3 },
            u_bayerLevels: { type: 'float', value: 3 },
            u_scale: { type: 'float', value: 1 }
        });
    });

    it('carries matrixLevels through as u_bayerLevels', () => {
        expect(ditherQuantizeUniforms({ matrixLevels: 1 }).u_bayerLevels).toEqual({ type: 'float', value: 1 });
    });

    it('accepts levels 2 as the legal minimum', () => {
        expect(ditherQuantizeUniforms({ levels: 2 }).u_levels).toEqual({ type: 'float', value: 2 });
    });

    it('throws when levels drops below 2, naming the value', () => {
        expect(() => ditherQuantizeUniforms({ levels: 1 })).toThrow(/"levels"[\s\S]*1/);
    });

    it('throws for a non-finite levels', () => {
        expect(() => ditherQuantizeUniforms({ levels: Number.POSITIVE_INFINITY })).toThrow(/"levels"/);
    });

    it('throws when scale is not greater than 0', () => {
        expect(() => ditherQuantizeUniforms({ scale: 0 })).toThrow(/"scale"[\s\S]*0/);
    });
});

describe('ditherGradientUniforms: colors and speed on top of the quantization set', () => {
    it('adds colorA, colorB and speed with duotone and speed defaults', () => {
        const result = ditherGradientUniforms();
        expect(result.u_colorA.type).toBe('vec3');
        expect(Array.from(result.u_colorA.value as Float32Array))
            .toEqual(Array.from(new Float32Array([0.05, 0.05, 0.08])));
        expect(Array.from(result.u_colorB.value as Float32Array))
            .toEqual(Array.from(new Float32Array([0.95, 0.95, 0.98])));
        expect(result.u_speed).toEqual({ type: 'float', value: 0.3 });
        expect(result.u_levels).toEqual({ type: 'float', value: 3 });
    });

    it('throws when colorA is not a 3-tuple, through the public path', () => {
        expect(() => ditherGradientUniforms({ colorA: [0.1, 0.2] as unknown as [number, number, number] }))
            .toThrow(/"colorA"/);
    });

    it('throws for a non-finite speed', () => {
        expect(() => ditherGradientUniforms({ speed: Number.NaN })).toThrow(/"speed"/);
    });
});
