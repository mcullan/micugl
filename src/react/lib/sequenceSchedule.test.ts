import { describe, expect, it } from 'vitest';

import {
    defaultCodecFor,
    frameTimestampMicros,
    resolveSequenceOptions,
    seededTimesMs,
    sequenceTimesMs
} from '@/react/lib/sequenceSchedule';
import { frameToMs } from '@/react/lib/timeKeeper';

describe('resolveSequenceOptions', () => {
    it('throws for a non-positive fps', () => {
        expect(() => resolveSequenceOptions({ fps: 0, frames: 10 })).toThrow(/fps/);
        expect(() => resolveSequenceOptions({ fps: -30, frames: 10 })).toThrow(/fps/);
    });

    it('throws when neither frames nor durationSeconds is given', () => {
        expect(() => resolveSequenceOptions({ fps: 30 })).toThrow(/exactly one/);
    });

    it('throws when both frames and durationSeconds are given', () => {
        expect(() => resolveSequenceOptions({ fps: 30, frames: 10, durationSeconds: 1 })).toThrow(/exactly one/);
    });

    it('derives frames from durationSeconds, rounding to the nearest integer', () => {
        expect(resolveSequenceOptions({ fps: 30, durationSeconds: 2 }).frames).toBe(60);
        expect(resolveSequenceOptions({ fps: 24, durationSeconds: 1 }).frames).toBe(24);
    });

    it('throws when an explicit frames value is not a positive integer', () => {
        expect(() => resolveSequenceOptions({ fps: 30, frames: 0 })).toThrow(/positive integer/);
        expect(() => resolveSequenceOptions({ fps: 30, frames: -5 })).toThrow(/positive integer/);
        expect(() => resolveSequenceOptions({ fps: 30, frames: 2.5 })).toThrow(/positive integer/);
    });

    it('defaults startFrame to 0', () => {
        expect(resolveSequenceOptions({ fps: 30, frames: 10 }).startFrame).toBe(0);
    });

    it('throws for a negative or non-finite startFrame', () => {
        expect(() => resolveSequenceOptions({ fps: 30, frames: 10, startFrame: -1 })).toThrow(/startFrame/);
        expect(() => resolveSequenceOptions({ fps: 30, frames: 10, startFrame: Infinity })).toThrow(/startFrame/);
        expect(() => resolveSequenceOptions({ fps: 30, frames: 10, startFrame: NaN })).toThrow(/startFrame/);
    });

    it('throws when startFrame is combined with seed', () => {
        expect(() => resolveSequenceOptions({
            fps: 30,
            frames: 10,
            startFrame: 5,
            seed: { kind: 'clear' }
        })).toThrow(/startFrame/);
    });

    it('defaults container to webm', () => {
        expect(resolveSequenceOptions({ fps: 30, frames: 10 }).container).toBe('webm');
    });

    it('throws when container is "none" without an onFrame callback', () => {
        expect(() => resolveSequenceOptions({ fps: 30, frames: 10, container: 'none' })).toThrow(/onFrame/);
    });

    it('passes when container is "none" with an onFrame callback', () => {
        expect(() => resolveSequenceOptions({
            fps: 30,
            frames: 10,
            container: 'none',
            onFrame: () => undefined
        })).not.toThrow();
    });

    it('defaults bitrate to 8_000_000', () => {
        expect(resolveSequenceOptions({ fps: 30, frames: 10 }).bitrate).toBe(8_000_000);
    });

    it('preserves an explicit bitrate', () => {
        expect(resolveSequenceOptions({ fps: 30, frames: 10, bitrate: 2_000_000 }).bitrate).toBe(2_000_000);
    });
});

describe('sequenceTimesMs', () => {
    it('steps by two library frames per output frame at 30fps', () => {
        const times = sequenceTimesMs(4, 30, 0);
        expect(times).toEqual([0, 2, 4, 6].map(frameToMs));
    });

    it('steps by one library frame per output frame at 60fps', () => {
        const times = sequenceTimesMs(4, 60, 0);
        expect(times).toEqual([0, 1, 2, 3].map(frameToMs));
    });

    it('steps by half a library frame per output frame at 120fps', () => {
        const times = sequenceTimesMs(4, 120, 0);
        expect(times).toEqual([0, 0.5, 1, 1.5].map(frameToMs));
    });

    it('offsets the schedule by startFrame', () => {
        const times = sequenceTimesMs(3, 60, 10);
        expect(times).toEqual([10, 11, 12].map(frameToMs));
    });
});

describe('seededTimesMs', () => {
    it('produces a zero-based millisecond schedule at the given fps', () => {
        expect(seededTimesMs(4, 30)).toEqual([0, 1000 / 30, 2000 / 30, 3000 / 30]);
        expect(seededTimesMs(3, 60)).toEqual([0, 1000 / 60, 2000 / 60]);
    });
});

describe('frameTimestampMicros', () => {
    it('converts frame index to rounded microseconds at the given fps', () => {
        expect(frameTimestampMicros(0, 30)).toBe(0);
        expect(frameTimestampMicros(1, 30)).toBe(33333);
        expect(frameTimestampMicros(2, 30)).toBe(66667);
    });

    it('rounds fractional microseconds', () => {
        expect(frameTimestampMicros(1, 3)).toBe(333333);
    });
});

describe('defaultCodecFor', () => {
    it('returns the VP9 codec string for webm', () => {
        expect(defaultCodecFor('webm')).toBe('vp09.00.10.08');
    });

    it('returns the VP9 codec string for mp4', () => {
        expect(defaultCodecFor('mp4')).toBe('vp09.00.10.08');
    });
});
