import { describe, expect, it } from 'vitest';

import { nextPowerOfTwo } from '@/react/lib/potCanvas';

describe('nextPowerOfTwo', () => {
    it('maps a dimension up to the next power of two, leaving exact powers unchanged', () => {
        expect(nextPowerOfTwo(1)).toBe(1);
        expect(nextPowerOfTwo(2)).toBe(2);
        expect(nextPowerOfTwo(3)).toBe(4);
        expect(nextPowerOfTwo(640)).toBe(1024);
        expect(nextPowerOfTwo(1023)).toBe(1024);
        expect(nextPowerOfTwo(1024)).toBe(1024);
    });

    it('clamps a degenerate dimension to 1', () => {
        expect(nextPowerOfTwo(0)).toBe(1);
        expect(nextPowerOfTwo(-5)).toBe(1);
        expect(nextPowerOfTwo(Number.NaN)).toBe(1);
    });
});
