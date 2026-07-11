import { describe, expect, it } from 'vitest';

import {
    createTimeKeeper,
    currentFrame,
    elapsedMs,
    frameToMs,
    msToFrame,
    setFrame,
    setSpeed,
    sync,
    tick
} from '@/react/lib/timeKeeper';

describe('tick', () => {
    it('accumulates elapsed milliseconds at unit speed', () => {
        let state = createTimeKeeper(1, 100);
        state = tick(state, 116);
        state = tick(state, 132);

        expect(elapsedMs(state)).toBe(32);
    });

    it('accumulates deltas rather than absolute-time times speed', () => {
        let fast = createTimeKeeper(2, 0);
        fast = tick(fast, 10);
        fast = setSpeed(fast, 4, 10);
        fast = tick(fast, 20);

        expect(elapsedMs(fast)).toBe(10 * 2 + 10 * 4);
    });

    it('scales by speed', () => {
        let state = createTimeKeeper(3, 0);
        state = tick(state, 10);

        expect(elapsedMs(state)).toBe(30);
    });

    it('runs backwards under negative speed', () => {
        let state = createTimeKeeper(1, 0);
        state = tick(state, 100);
        state = setSpeed(state, -1, 100);
        state = tick(state, 150);

        expect(elapsedMs(state)).toBe(100 - 50);
    });
});

describe('setSpeed', () => {
    it('does not jump when speed changes mid-flight', () => {
        let state = createTimeKeeper(1, 0);
        state = tick(state, 1000);
        const before = elapsedMs(state);

        state = setSpeed(state, 10, 1000);
        expect(elapsedMs(state)).toBe(before);

        state = tick(state, 1001);
        expect(elapsedMs(state)).toBe(before + 10);
    });
});

describe('sync', () => {
    it('advances the tick reference without accumulating paused time', () => {
        let state = createTimeKeeper(1, 0);
        state = tick(state, 100);
        const paused = elapsedMs(state);

        state = sync(state, 5000);
        expect(elapsedMs(state)).toBe(paused);

        state = tick(state, 5010);
        expect(elapsedMs(state)).toBe(paused + 10);
    });
});

describe('setFrame', () => {
    it('overwrites the accumulator on a 60fps timebase', () => {
        let state = createTimeKeeper(1, 0);
        state = tick(state, 500);

        state = setFrame(state, 120, 500);
        expect(elapsedMs(state)).toBe(2000);
        expect(currentFrame(state)).toBe(120);
    });

    it('continues from the set frame under real time', () => {
        let state = createTimeKeeper(1, 0);
        state = setFrame(state, 60, 1000);
        state = tick(state, 1016);

        expect(elapsedMs(state)).toBe(1000 + 16);
    });
});

describe('frame conversions', () => {
    it('round-trips frame and milliseconds', () => {
        expect(frameToMs(120)).toBe(2000);
        expect(msToFrame(2000)).toBe(120);
        expect(msToFrame(frameToMs(45))).toBe(45);
    });
});
