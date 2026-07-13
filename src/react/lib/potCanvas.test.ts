import { describe, expect, it } from 'vitest';

import { nextPowerOfTwo, resizeSourceToPot } from '@/react/lib/potCanvas';
import type { TextureUploadSource } from '@/types';

describe('nextPowerOfTwo', () => {
    it('maps a dimension up to the next power of two, leaving exact powers unchanged', () => {
        expect(nextPowerOfTwo(1)).toBe(1);
        expect(nextPowerOfTwo(2)).toBe(2);
        expect(nextPowerOfTwo(3)).toBe(4);
        expect(nextPowerOfTwo(640)).toBe(1024);
        expect(nextPowerOfTwo(1023)).toBe(1024);
        expect(nextPowerOfTwo(1024)).toBe(1024);
    });

    it('throws on a degenerate dimension instead of quietly clamping it to 1', () => {
        expect(() => nextPowerOfTwo(0)).toThrow(/at least 1, got 0/);
        expect(() => nextPowerOfTwo(-5)).toThrow(/at least 1, got -5/);
        expect(() => nextPowerOfTwo(Number.NaN)).toThrow(/at least 1, got NaN/);
    });
});

describe('resizeSourceToPot', () => {
    it('fails loud on a zero-sized source instead of laundering it into a blank 1x1 canvas', () => {
        const source = { width: 0, height: 0 } as unknown as TextureUploadSource;
        const unreachableFactory = (): HTMLCanvasElement => {
            throw new Error('the factory must not be reached for a zero-sized source');
        };

        expect(() => resizeSourceToPot(source, unreachableFactory)).toThrow(/no pixels to draw/);
        expect(() => resizeSourceToPot(source, unreachableFactory)).toThrow(/0x0/);
    });
});
