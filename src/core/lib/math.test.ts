import { describe, expect, it } from 'vitest';

import { isPowerOfTwo } from '@/core/lib/math';

describe('isPowerOfTwo', () => {
    it('accepts positive powers of two only', () => {
        expect(isPowerOfTwo(1)).toBe(true);
        expect(isPowerOfTwo(256)).toBe(true);
        expect(isPowerOfTwo(3)).toBe(false);
        expect(isPowerOfTwo(0)).toBe(false);
        expect(isPowerOfTwo(-256)).toBe(false);
        expect(isPowerOfTwo(1.5)).toBe(false);
        expect(isPowerOfTwo(Number.NaN)).toBe(false);
    });
});
