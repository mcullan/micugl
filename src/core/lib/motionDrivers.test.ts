import { describe, expect, it } from 'vitest';

import {
    createMotionState,
    resolveTransitionConfig,
    retargetMotion,
    sampleMotion
} from '@/core/lib/motionDrivers';
import type { UniformTransitionConfig } from '@/types';

function tween(config: UniformTransitionConfig) {
    return resolveTransitionConfig(config);
}

describe('resolveTransitionConfig', () => {
    it('defaults delay to 0 and resolves the named easing', () => {
        const resolved = tween({ duration: 200 });
        expect(resolved.duration).toBe(200);
        expect(resolved.delay).toBe(0);
        expect(resolved.easing(0.5)).toBe(0.5);
    });

    it('duration: 0 is legal (snap)', () => {
        expect(() => tween({ duration: 0 })).not.toThrow();
    });

    it('throws on a negative duration', () => {
        expect(() => tween({ duration: -1 })).toThrow(/duration/);
    });

    it('throws on a non-finite duration', () => {
        expect(() => tween({ duration: Number.NaN })).toThrow(/duration/);
    });

    it('throws on a negative delay', () => {
        expect(() => tween({ duration: 100, delay: -5 })).toThrow(/delay/);
    });

    it('throws on an unknown easing name', () => {
        expect(() => tween({ duration: 100, easing: 'bounce' as unknown as 'linear' })).toThrow(/easing/);
    });
});

describe('retargetMotion + sampleMotion (tween)', () => {
    it('reaches the exact target value at t >= 1 and reports settled', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        const settledAtStart = sampleMotion(state, 0);
        expect(settledAtStart).toBe(false);
        expect(Array.from(state.current)).toEqual([0]);

        const settledAtEnd = sampleMotion(state, 100);
        expect(settledAtEnd).toBe(true);
        expect(Array.from(state.current)).toEqual([10]);
        expect(state.settled).toBe(true);
    });

    it('linear easing hits the exact midpoint at half the duration', () => {
        const config = tween({ duration: 100, easing: 'linear' });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        sampleMotion(state, 50);

        expect(state.current[0]).toBeCloseTo(5);
    });

    it('clamps sampling past the end of the duration to the exact target', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        const settled = sampleMotion(state, 10_000);

        expect(settled).toBe(true);
        expect(Array.from(state.current)).toEqual([10]);
    });

    it('a delay holds the value at "from" until the delay elapses', () => {
        const config = tween({ duration: 100, delay: 50 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        sampleMotion(state, 25);
        expect(state.current[0]).toBe(0);

        sampleMotion(state, 100);
        expect(state.current[0]).toBeCloseTo(5);

        const settled = sampleMotion(state, 150);
        expect(settled).toBe(true);
        expect(state.current[0]).toBe(10);
    });

    it('duration: 0 snaps to the target on the first sample', () => {
        const config = tween({ duration: 0 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        const settled = sampleMotion(state, 0);

        expect(settled).toBe(true);
        expect(Array.from(state.current)).toEqual([10]);
    });

    it('mid-flight retarget starts the new leg from the interpolated current value, not the old "from"', () => {
        const config = tween({ duration: 100, easing: 'linear' });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        sampleMotion(state, 50);
        expect(state.current[0]).toBeCloseTo(5);

        retargetMotion(state, [20], config);
        expect(Array.from(state.from)).toEqual([5]);

        sampleMotion(state, 50);
        expect(state.current[0]).toBeCloseTo(5);

        sampleMotion(state, 100);
        expect(state.current[0]).toBeCloseTo(12.5);
    });

    it('lazily captures startTime on the first sample after a retarget, not at retarget time', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        expect(state.startTime).toBeNull();

        sampleMotion(state, 500);
        expect(state.startTime).toBe(500);

        sampleMotion(state, 600);
        expect(state.current[0]).toBeCloseTo(10);
    });

    it('calls a custom interpolate hook with (from, to, easedT, out)', () => {
        const calls: { from: number[]; to: number[]; t: number }[] = [];
        const config = tween({
            duration: 100,
            easing: 'linear',
            interpolate: (from, to, t, out) => {
                calls.push({ from: Array.from(from), to: Array.from(to), t });
                out[0] = from[0] + (to[0] - from[0]) * t;
            }
        });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        sampleMotion(state, 25);

        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({ from: [0], to: [10], t: 0.25 });
        expect(state.current[0]).toBeCloseTo(2.5);
    });

    it('throws on a target longer than the state, instead of silently truncating it', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([0]));

        expect(() => { retargetMotion(state, [1, 2, 3], config) }).toThrow(RangeError);
    });

    it('sampling an already-settled state is a no-op that reports settled', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([5]));

        expect(state.settled).toBe(true);
        const settled = sampleMotion(state, 999);

        expect(settled).toBe(true);
        expect(state.current[0]).toBe(5);
    });
});
