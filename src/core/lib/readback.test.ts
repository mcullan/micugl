import { describe, expect, it } from 'vitest';

import { flipYPixels } from '@/core/lib/readback';

describe('flipYPixels', () => {
    it('reverses row order for a 2x2 image', () => {
        const pixels = new Uint8ClampedArray([
            1, 1, 1, 1, 2, 2, 2, 2,
            3, 3, 3, 3, 4, 4, 4, 4
        ]);

        const flipped = flipYPixels(pixels, 2, 2);

        expect(Array.from(flipped)).toEqual([
            3, 3, 3, 3, 4, 4, 4, 4,
            1, 1, 1, 1, 2, 2, 2, 2
        ]);
    });

    it('is a no-op for a single row', () => {
        const pixels = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

        expect(Array.from(flipYPixels(pixels, 2, 1))).toEqual(Array.from(pixels));
    });

    it('is a no-op for a single-pixel image', () => {
        const pixels = new Uint8ClampedArray([9, 8, 7, 6]);

        expect(Array.from(flipYPixels(pixels, 1, 1))).toEqual([9, 8, 7, 6]);
    });

    it('reverses row order for an odd number of rows, keeping the middle row in place', () => {
        const pixels = new Uint8ClampedArray([
            1, 1, 1, 1,
            2, 2, 2, 2,
            3, 3, 3, 3
        ]);

        const flipped = flipYPixels(pixels, 1, 3);

        expect(Array.from(flipped)).toEqual([
            3, 3, 3, 3,
            2, 2, 2, 2,
            1, 1, 1, 1
        ]);
    });

    it('preserves asymmetric per-row content while reversing row order', () => {
        const pixels = new Uint8ClampedArray([
            10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
            11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121
        ]);

        const flipped = flipYPixels(pixels, 3, 2);

        expect(Array.from(flipped)).toEqual([
            11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121,
            10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120
        ]);
    });

    it('throws when the buffer length does not match the given dimensions', () => {
        expect(() => flipYPixels(new Uint8ClampedArray(4), 2, 2)).toThrow(/does not match/);
    });
});
