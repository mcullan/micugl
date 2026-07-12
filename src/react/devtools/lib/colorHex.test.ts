import { describe, expect, it } from 'vitest';

import { componentsToHex, hexToComponents, isOutOfGamut } from '@/react/devtools/lib/colorHex';

describe('componentsToHex', () => {
    it('converts unit-range components to an rgb hex string', () => {
        expect(componentsToHex([1, 0, 0])).toBe('#ff0000');
        expect(componentsToHex([0, 0, 0])).toBe('#000000');
        expect(componentsToHex([1, 1, 1])).toBe('#ffffff');
    });

    it('clamps out-of-gamut components', () => {
        expect(componentsToHex([2, -1, 0.5])).toBe('#ff0080');
    });
});

describe('hexToComponents', () => {
    it('round-trips a hex string back to unit-range components', () => {
        expect(hexToComponents('#ff0000')).toEqual([1, 0, 0]);
        expect(hexToComponents('00ff00')).toEqual([0, 1, 0]);
    });

    it('throws on an invalid hex string', () => {
        expect(() => hexToComponents('not-a-color')).toThrow(/invalid color hex/);
    });
});

describe('isOutOfGamut', () => {
    it('is false for components within [0,1]', () => {
        expect(isOutOfGamut([0, 0.5, 1])).toBe(false);
    });

    it('is true when a component exceeds the unit range', () => {
        expect(isOutOfGamut([0, 1.5, 0])).toBe(true);
    });

    it('is true for a negative component', () => {
        expect(isOutOfGamut([-0.1, 0, 0])).toBe(true);
    });
});
