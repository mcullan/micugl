import { describe, expect, it } from 'vitest';

import type { BandRange } from '@/core/lib/audioBands';
import {
    applyEnvelope,
    computeBandRanges,
    reduceBands,
    validateAudioOptions
} from '@/core/lib/audioBands';

function assertPartition(ranges: BandRange[], bands: number): void {
    expect(ranges).toHaveLength(bands);
    for (let i = 0; i < ranges.length; i++) {
        expect(ranges[i].end).toBeGreaterThan(ranges[i].start);
        if (i > 0) {
            expect(ranges[i].start).toBe(ranges[i - 1].end);
        }
    }
}

function pairs(ranges: BandRange[]): number[][] {
    return ranges.map(range => [range.start, range.end]);
}

describe('computeBandRanges', () => {
    it('linear layout covers every bin exactly once', () => {
        const ranges = computeBandRanges(32, 48000, 4, 'linear');

        assertPartition(ranges, 4);
        expect(pairs(ranges)).toEqual([[0, 8], [8, 16], [16, 24], [24, 32]]);

        const covered: number[] = [];
        for (const range of ranges) {
            for (let bin = range.start; bin < range.end; bin++) {
                covered.push(bin);
            }
        }
        expect(covered).toEqual(Array.from({ length: 32 }, (_, i) => i));
    });

    it('log layout is monotone, non-overlapping, geometric, and skips the DC bin', () => {
        const ranges = computeBandRanges(1024, 48000, 4, 'log');

        assertPartition(ranges, 4);
        expect(pairs(ranges)).toEqual([[1, 5], [5, 27], [27, 152], [152, 854]]);
        expect(ranges[0].start).toBe(1);
        expect(ranges[3].end).toBeLessThanOrEqual(1024);

        const widths = ranges.map(range => range.end - range.start);
        for (let i = 1; i < widths.length; i++) {
            expect(widths[i]).toBeGreaterThan(widths[i - 1]);
        }
    });

    it('log layout stops at nyquist when nyquist is below 20 kHz', () => {
        const ranges = computeBandRanges(1024, 22050, 4, 'log');

        assertPartition(ranges, 4);
        expect(ranges[3].end).toBe(1024);
        expect(pairs(ranges)).toEqual([[1, 9], [9, 44], [44, 211], [211, 1024]]);
    });

    it('every band is non-empty in the degenerate cases where the raw log edges collapse onto one bin', () => {
        const tinyFft = computeBandRanges(16, 48000, 4, 'log');
        assertPartition(tinyFft, 4);
        expect(pairs(tinyFft)).toEqual([[1, 2], [2, 3], [3, 4], [4, 14]]);

        const lowSampleRate = computeBandRanges(16, 8000, 4, 'log');
        assertPartition(lowSampleRate, 4);
        expect(pairs(lowSampleRate)).toEqual([[1, 2], [2, 3], [3, 4], [4, 16]]);

        const lowestSampleRate = computeBandRanges(16, 3000, 4, 'log');
        assertPartition(lowestSampleRate, 4);

        const crushedAgainstTheTop = computeBandRanges(16, 50, 4, 'log');
        assertPartition(crushedAgainstTheTop, 4);
        expect(pairs(crushedAgainstTheTop)).toEqual([[12, 13], [13, 14], [14, 15], [15, 16]]);
        expect(crushedAgainstTheTop[3].end).toBeLessThanOrEqual(16);

        const fewBins = computeBandRanges(5, 48000, 4, 'linear');
        assertPartition(fewBins, 4);
        expect(pairs(fewBins)).toEqual([[0, 1], [1, 3], [3, 4], [4, 5]]);
    });

    it('a single band spans the whole audible range', () => {
        const ranges = computeBandRanges(1024, 48000, 1, 'log');

        assertPartition(ranges, 1);
        expect(pairs(ranges)).toEqual([[1, 854]]);
    });

    it('throws when the audible span has fewer bins than bands, instead of returning duplicate bands', () => {
        expect(() => computeBandRanges(16, 384000, 4, 'log')).toThrow(/cannot be\s+split into 4 non-empty/);
        expect(() => computeBandRanges(16, 384000, 4, 'log')).toThrow(/Raise "fftSize"/);
    });

    it('throws when there are fewer bins than bands in linear layout', () => {
        expect(() => computeBandRanges(3, 48000, 4, 'linear')).toThrow(/cannot split 3 frequency bins into 4/);
    });

    it('throws on nonsense inputs', () => {
        expect(() => computeBandRanges(0, 48000, 4, 'log')).toThrow(/binCount must be a positive integer/);
        expect(() => computeBandRanges(1024, 0, 4, 'log')).toThrow(/sampleRate must be a finite positive number/);
        expect(() => computeBandRanges(1024, 48000, 0, 'log')).toThrow(/bands must be a positive integer/);
    });
});

describe('reduceBands', () => {
    it('reduces byte bins to the 0..1 mean of each band', () => {
        const freqData = new Uint8Array([0, 255, 51, 204, 255, 255, 0, 0]);
        const ranges: BandRange[] = [{ start: 0, end: 4 }, { start: 4, end: 8 }];
        const out = new Float32Array(2);

        reduceBands(freqData, ranges, out);

        expect(out[0]).toBeCloseTo(0.5, 10);
        expect(out[1]).toBeCloseTo(0.5, 10);
    });

    it('a full-scale band reads 1 and a silent band reads 0', () => {
        const freqData = new Uint8Array([255, 255, 0, 0]);
        const ranges: BandRange[] = [{ start: 0, end: 2 }, { start: 2, end: 4 }];
        const out = new Float32Array(2);

        reduceBands(freqData, ranges, out);

        expect(Array.from(out)).toEqual([1, 0]);
    });

    it('reduces bands of unequal width by their own means, not the global mean', () => {
        const freqData = new Uint8Array([255, 0, 0, 0, 0]);
        const ranges: BandRange[] = [{ start: 0, end: 1 }, { start: 1, end: 5 }];
        const out = new Float32Array(2);

        reduceBands(freqData, ranges, out);

        expect(Array.from(out)).toEqual([1, 0]);
    });

    it('throws when the output buffer does not match the band count', () => {
        const ranges: BandRange[] = [{ start: 0, end: 2 }];
        expect(() => { reduceBands(new Uint8Array(4), ranges, new Float32Array(2)) })
            .toThrow(/received 1 band range\(s\) but an output buffer of length 2/);
    });

    it('throws when a range reaches past the frequency buffer, instead of averaging in undefined', () => {
        const ranges: BandRange[] = [{ start: 0, end: 8 }];
        expect(() => { reduceBands(new Uint8Array(4), ranges, new Float32Array(1)) })
            .toThrow(/not a non-empty range inside the 4-bin frequency buffer/);
    });
});

describe('applyEnvelope', () => {
    it('is the exact one-pole coefficient at a fixed dt', () => {
        const env = applyEnvelope(0, 1, 0.1, 0.25, 0.5);

        expect(env).toBeCloseTo(0.32967995396436073, 12);
        expect(env).toBeCloseTo(1 - Math.exp(-0.4), 12);
    });

    it('uses release, not attack, when the target is below the envelope', () => {
        const env = applyEnvelope(1, 0, 0.1, 0.25, 0.5);

        expect(env).toBeCloseTo(Math.exp(-0.2), 12);
        expect(env).toBeCloseTo(0.8187307530779818, 12);
    });

    it('rises faster than it falls for symmetric inputs', () => {
        const attack = 0.05;
        const release = 0.4;
        const dt = 1 / 60;

        const rise = applyEnvelope(0, 1, dt, attack, release) - 0;
        const fall = 1 - applyEnvelope(1, 0, dt, attack, release);

        expect(rise).toBeGreaterThan(fall);
        expect(rise).toBeCloseTo(1 - Math.exp(-dt / attack), 12);
        expect(fall).toBeCloseTo(1 - Math.exp(-dt / release), 12);
    });

    it('converges to the target over repeated steps', () => {
        let env = 0;
        for (let i = 0; i < 200; i++) {
            env = applyEnvelope(env, 0.75, 1 / 60, 0.05, 0.4);
        }

        expect(env).toBeCloseTo(0.75, 6);
    });

    it('dt = 0 is the identity, and never poisons the envelope with NaN even when the time constant is 0', () => {
        expect(applyEnvelope(0.42, 1, 0, 0.05, 0.4)).toBe(0.42);
        expect(applyEnvelope(0.42, 1, 0, 0, 0)).toBe(0.42);
        expect(applyEnvelope(0.42, 1, -0.5, 0, 0)).toBe(0.42);
    });

    it('a time constant of 0 snaps straight to the target at any positive dt', () => {
        expect(applyEnvelope(0, 1, 1 / 60, 0, 0.4)).toBe(1);
        expect(applyEnvelope(1, 0, 1 / 60, 0.05, 0)).toBe(0);
    });
});

describe('validateAudioOptions', () => {
    it('fills in the documented defaults', () => {
        const resolved = validateAudioOptions();

        expect(resolved).toEqual({
            bands: 4,
            fftSize: 2048,
            smoothingTimeConstant: 0.8,
            attack: 0,
            release: 0,
            minDecibels: -90,
            maxDecibels: -10,
            bandLayout: 'log',
            names: { bands: 'u_audioBands', level: 'u_audioLevel' }
        });
    });

    it('forces smoothingTimeConstant to 0 when an envelope is supplied', () => {
        const withAttack = validateAudioOptions({ attack: 0.01 });
        expect(withAttack.smoothingTimeConstant).toBe(0);
        expect(withAttack.attack).toBe(0.01);
        expect(withAttack.release).toBe(0);

        const withRelease = validateAudioOptions({ release: 0.18 });
        expect(withRelease.smoothingTimeConstant).toBe(0);

        const noSmoothingRequested = validateAudioOptions({});
        expect(noSmoothingRequested.smoothingTimeConstant).toBe(0.8);
    });

    it('throws rather than silently zeroing an explicit smoothingTimeConstant that an envelope would override', () => {
        expect(() => validateAudioOptions({ smoothingTimeConstant: 0.6, attack: 0.01 }))
            .toThrow(/cannot be combined with "attack"\/"release"/);
        expect(() => validateAudioOptions({ smoothingTimeConstant: 0.6, release: 0.2 }))
            .toThrow(/silently ignored/);

        expect(() => validateAudioOptions({ smoothingTimeConstant: 0, attack: 0.01 })).not.toThrow();
    });

    it('throws for bands outside 1..4, naming the spectrum-texture path as the reason for the cap', () => {
        expect(() => validateAudioOptions({ bands: 5 })).toThrow(/sampler2D/);
        expect(() => validateAudioOptions({ bands: 5 })).toThrow(/must be an integer between 1 and 4/);
        expect(() => validateAudioOptions({ bands: 0 })).toThrow(/must be an integer between 1 and 4/);
        expect(() => validateAudioOptions({ bands: 2.5 })).toThrow(/must be an integer between 1 and 4/);

        expect(validateAudioOptions({ bands: 1 }).bands).toBe(1);
        expect(validateAudioOptions({ bands: 4 }).bands).toBe(4);
    });

    it('throws for an fftSize that is not a power of two in 32..32768', () => {
        expect(() => validateAudioOptions({ fftSize: 1000 })).toThrow(/power of two between 32 and 32768/);
        expect(() => validateAudioOptions({ fftSize: 16 })).toThrow(/power of two between 32 and 32768/);
        expect(() => validateAudioOptions({ fftSize: 65536 })).toThrow(/power of two between 32 and 32768/);

        expect(validateAudioOptions({ fftSize: 32 }).fftSize).toBe(32);
        expect(validateAudioOptions({ fftSize: 32768 }).fftSize).toBe(32768);
    });

    it('throws for an inverted or empty decibel window', () => {
        expect(() => validateAudioOptions({ minDecibels: -10, maxDecibels: -90 })).toThrow(/strictly below/);
        expect(() => validateAudioOptions({ minDecibels: -30, maxDecibels: -30 })).toThrow(/strictly below/);
        expect(() => validateAudioOptions({ minDecibels: Number.NaN })).toThrow(/strictly below/);
    });

    it('throws for negative or non-finite attack/release', () => {
        expect(() => validateAudioOptions({ attack: -0.01 })).toThrow(/"attack" must be a finite number of seconds/);
        expect(() => validateAudioOptions({ release: -1 })).toThrow(/"release" must be a finite number of seconds/);
        expect(() => validateAudioOptions({ attack: Number.POSITIVE_INFINITY }))
            .toThrow(/"attack" must be a finite number of seconds/);
    });

    it('throws for a smoothingTimeConstant outside 0..1', () => {
        expect(() => validateAudioOptions({ smoothingTimeConstant: 1.5 })).toThrow(/between 0 and 1/);
        expect(() => validateAudioOptions({ smoothingTimeConstant: -0.1 })).toThrow(/between 0 and 1/);
    });

    it('throws for an unknown bandLayout', () => {
        expect(() => validateAudioOptions({ bandLayout: 'mel' as 'log' })).toThrow(/must be "log" or "linear"/);
    });

    it('throws for empty or colliding uniform names', () => {
        expect(() => validateAudioOptions({ names: { bands: '   ' } })).toThrow(/"names.bands" must be a non-empty/);
        expect(() => validateAudioOptions({ names: { level: '' } })).toThrow(/"names.level" must be a non-empty/);
        expect(() => validateAudioOptions({ names: { bands: 'u_x', level: 'u_x' } }))
            .toThrow(/must be different uniform names/);

        expect(validateAudioOptions({ names: { bands: 'u_fft' } }).names)
            .toEqual({ bands: 'u_fft', level: 'u_audioLevel' });
    });
});
