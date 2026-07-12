import { describe, expect, it } from 'vitest';

import { formatValue, getStep, padFor, stepForType } from '@/react/devtools/lib/step';

describe('getStep', () => {
    it('matches the documented worked values', () => {
        expect(getStep(0)).toBeCloseTo(0.01);
        expect(getStep(0.5)).toBeCloseTo(0.01);
        expect(getStep(0.05)).toBeCloseTo(0.001);
        expect(getStep(1)).toBeCloseTo(0.1);
        expect(getStep(3)).toBeCloseTo(0.1);
        expect(getStep(10)).toBeCloseTo(1);
        expect(getStep(100)).toBeCloseTo(10);
        expect(getStep(150)).toBeCloseTo(1);
        expect(getStep(1000)).toBeCloseTo(100);
        expect(getStep(3.14159)).toBeCloseTo(0.001);
    });

    it('never returns below the 0.001 floor', () => {
        expect(getStep(0.0000001)).toBeGreaterThanOrEqual(0.001);
    });

    it('falls back to the default step for non-finite input', () => {
        expect(getStep(Number.NaN)).toBe(0.01);
        expect(getStep(Number.POSITIVE_INFINITY)).toBe(0.01);
    });

    it('is sign-independent', () => {
        expect(getStep(-3)).toBeCloseTo(getStep(3));
    });
});

describe('stepForType', () => {
    it('is always 1 for int', () => {
        expect(stepForType('int', 42)).toBe(1);
        expect(stepForType('int', 0.4)).toBe(1);
    });

    it('is always 1 for sampler2D', () => {
        expect(stepForType('sampler2D', 7)).toBe(1);
    });

    it('delegates to getStep for float', () => {
        expect(stepForType('float', 1)).toBeCloseTo(getStep(1));
    });
});

describe('padFor', () => {
    it('clamps between 0 and 2', () => {
        expect(padFor(100)).toBe(0);
        expect(padFor(1)).toBe(0);
        expect(padFor(0.1)).toBe(1);
        expect(padFor(0.001)).toBe(2);
        expect(padFor(0.0000001)).toBe(2);
    });
});

describe('formatValue', () => {
    it('formats with the precision implied by step', () => {
        expect(formatValue(3.14159, 0.001)).toBe('3.14');
        expect(formatValue(42, 1)).toBe('42');
        expect(formatValue(1.5, 0.1)).toBe('1.5');
    });
});
