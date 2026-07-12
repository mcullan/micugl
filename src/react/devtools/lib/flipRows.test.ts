import { describe, expect, it } from 'vitest';

import { flipImageRows } from '@/react/devtools/lib/flipRows';

describe('flipImageRows', () => {
    it('reverses row order for a 2x2 image', () => {
        const pixels = new Uint8ClampedArray([
            1, 1, 1, 1, 2, 2, 2, 2,
            3, 3, 3, 3, 4, 4, 4, 4
        ]);

        const flipped = flipImageRows(pixels, 2, 2);

        expect(Array.from(flipped)).toEqual([
            3, 3, 3, 3, 4, 4, 4, 4,
            1, 1, 1, 1, 2, 2, 2, 2
        ]);
    });

    it('is a no-op for a single row', () => {
        const pixels = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

        expect(Array.from(flipImageRows(pixels, 2, 1))).toEqual(Array.from(pixels));
    });

    it('throws when the buffer length does not match the given dimensions', () => {
        expect(() => flipImageRows(new Uint8ClampedArray(4), 2, 2)).toThrow(/does not match/);
    });
});
