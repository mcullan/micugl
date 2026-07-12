import { describe, expect, it } from 'vitest';

import { evaluate } from '@/react/devtools/lib/evaluate';

describe('evaluate', () => {
    it('parses a plain number', () => {
        expect(evaluate('42')).toBe(42);
        expect(evaluate('3.14')).toBeCloseTo(3.14);
    });

    it('handles unary minus', () => {
        expect(evaluate('-5')).toBe(-5);
        expect(evaluate('-3.5')).toBeCloseTo(-3.5);
    });

    it('respects operator precedence (multiplication before addition)', () => {
        expect(evaluate('2+3*4')).toBe(14);
        expect(evaluate('3*4+2')).toBe(14);
    });

    it('respects operator precedence (division before subtraction)', () => {
        expect(evaluate('10-4/2')).toBe(8);
    });

    it('supports exponentiation', () => {
        expect(evaluate('2^3')).toBe(8);
    });

    it('supports parentheses to override precedence', () => {
        expect(evaluate('(2+3)*4')).toBe(20);
        expect(evaluate('2*(3+4)')).toBe(14);
    });

    it('supports nested parentheses', () => {
        expect(evaluate('((1+2)*(3+4))')).toBe(21);
    });

    it('supports a common tuning expression', () => {
        expect(evaluate('3.14159/2')).toBeCloseTo(1.570795);
    });

    it('supports subtracting a negative number', () => {
        expect(evaluate('3--2')).toBe(5);
    });

    it('ignores surrounding whitespace', () => {
        expect(evaluate(' 2 + 3 ')).toBe(5);
    });

    it('throws on garbage input', () => {
        expect(() => evaluate('abc')).toThrow();
    });

    it('throws on a dangling operator', () => {
        expect(() => evaluate('3+')).toThrow();
    });

    it('throws on an empty expression', () => {
        expect(() => evaluate('')).toThrow();
        expect(() => evaluate('   ')).toThrow();
    });

    it('throws on unbalanced parentheses', () => {
        expect(() => evaluate('(1+2')).toThrow();
    });
});
