import { describe, expect, it } from 'vitest';

import { resolveEasing } from '@/core/lib/easing';

describe('resolveEasing', () => {
    it('defaults to linear when no easing is given', () => {
        const fn = resolveEasing(undefined);
        expect(fn(0)).toBe(0);
        expect(fn(0.5)).toBe(0.5);
        expect(fn(1)).toBe(1);
    });

    it('every named easing is exact at the endpoints', () => {
        for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
            const fn = resolveEasing(name);
            expect(fn(0)).toBe(0);
            expect(fn(1)).toBe(1);
        }
    });

    it('easeIn starts slower than linear at the midpoint', () => {
        expect(resolveEasing('easeIn')(0.5)).toBeLessThan(0.5);
    });

    it('easeOut starts faster than linear at the midpoint', () => {
        expect(resolveEasing('easeOut')(0.5)).toBeGreaterThan(0.5);
    });

    it('easeInOut is symmetric around the midpoint', () => {
        expect(resolveEasing('easeInOut')(0.5)).toBe(0.5);
    });

    it('returns a custom easing function unchanged', () => {
        const custom = (t: number): number => t * t * t;
        expect(resolveEasing(custom)).toBe(custom);
    });

    it('throws on an unknown easing name', () => {
        expect(() => { resolveEasing('bounce' as unknown as 'linear') }).toThrow(/unknown easing/);
    });
});
