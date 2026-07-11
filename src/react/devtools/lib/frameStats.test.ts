import { describe, expect, it } from 'vitest';

import { computeFrameStats, fpsFromMean, pushCapped } from '@/react/devtools/lib/frameStats';

describe('computeFrameStats', () => {
    it('returns zeros for an empty ring buffer', () => {
        expect(computeFrameStats([])).toEqual({ count: 0, mean: 0, p50: 0, p95: 0 });
    });

    it('computes mean over the samples', () => {
        const stats = computeFrameStats([10, 20, 30]);
        expect(stats.count).toBe(3);
        expect(stats.mean).toBe(20);
    });

    it('computes p50 and p95 from the sorted samples', () => {
        const deltas = [16, 16, 16, 16, 16, 16, 16, 16, 16, 100];
        const stats = computeFrameStats(deltas);
        expect(stats.p50).toBe(16);
        expect(stats.p95).toBe(100);
    });

    it('does not mutate the input buffer while sorting', () => {
        const deltas = [30, 10, 20];
        computeFrameStats(deltas);
        expect(deltas).toEqual([30, 10, 20]);
    });
});

describe('fpsFromMean', () => {
    it('converts a mean frame time in ms to frames per second', () => {
        expect(fpsFromMean(16.6667)).toBeCloseTo(60, 1);
        expect(fpsFromMean(33.3333)).toBeCloseTo(30, 1);
    });

    it('returns 0 for a non-positive mean', () => {
        expect(fpsFromMean(0)).toBe(0);
        expect(fpsFromMean(-5)).toBe(0);
    });
});

describe('pushCapped', () => {
    it('appends values and drops the oldest beyond the cap', () => {
        const buffer: number[] = [];
        for (let i = 1; i <= 5; i += 1) {
            pushCapped(buffer, i, 3);
        }
        expect(buffer).toEqual([3, 4, 5]);
    });
});
