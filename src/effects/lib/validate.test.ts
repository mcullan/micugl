import { describe, expect, it } from 'vitest';

import { assertColors, assertFinite, assertVec3 } from '@/effects/lib/validate';
import type { Vec3 } from '@/types';

describe('effects validate: finite numbers', () => {
    it('returns a finite number unchanged', () => {
        expect(assertFinite('speed', 0.2)).toBe(0.2);
        expect(assertFinite('seed', -3)).toBe(-3);
    });

    it('throws naming the offending prop for NaN', () => {
        expect(() => assertFinite('warp', Number.NaN)).toThrow(/"warp".*finite/s);
    });

    it('throws naming the offending prop for Infinity', () => {
        expect(() => assertFinite('intensity', Number.POSITIVE_INFINITY)).toThrow(/"intensity".*finite/s);
    });
});

describe('effects validate: vec3 tuples', () => {
    it('returns a fresh tuple with the same values', () => {
        const color: Vec3 = [0.1, 0.2, 0.3];
        const result = assertVec3('color', color);
        expect(result).toEqual(color);
        expect(result).not.toBe(color);
    });

    it('throws on the wrong tuple length', () => {
        expect(() => assertVec3('color', [0.1, 0.2])).toThrow(/"color".*3-number tuple/s);
        expect(() => assertVec3('color', [0.1, 0.2, 0.3, 0.4])).toThrow(/"color".*3-number tuple/s);
    });

    it('throws naming the offending channel for a NaN component', () => {
        expect(() => assertVec3('grainColor', [0.1, Number.NaN, 0.3])).toThrow(/"grainColor\[1\]".*finite/s);
    });
});

describe('effects validate: colors length 2 to 4', () => {
    it('accepts 2 colors and 4 colors, returning fresh tuples', () => {
        const two: Vec3[] = [[0, 0, 0], [1, 1, 1]];
        const four: Vec3[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.2, 0.4, 0.6]];
        const twoResult = assertColors('colors', two);
        expect(twoResult).toEqual(two);
        expect(twoResult[0]).not.toBe(two[0]);
        expect(assertColors('colors', four)).toEqual(four);
    });

    it('throws for 1 color and for 5 colors', () => {
        expect(() => assertColors('colors', [[0, 0, 0]])).toThrow(/"colors".*between 2 and 4/s);
        expect(() => assertColors('colors', [[0, 0, 0], [1, 1, 1], [0, 0, 0], [1, 1, 1], [0, 0, 0]]))
            .toThrow(/"colors".*between 2 and 4/s);
    });
});
