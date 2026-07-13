import { describe, expect, it } from 'vitest';

import {
    createMotionState,
    resolveTransitionConfig,
    retargetMotion,
    sampleMotion
} from '@/core/lib/motionDrivers';
import type { SpringTransitionConfig, UniformTransitionConfig } from '@/types';

function tween(config: UniformTransitionConfig) {
    const resolved = resolveTransitionConfig(config);
    if (resolved.kind !== 'tween') {
        throw new Error('expected a tween config');
    }
    return resolved;
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

function spring(config: SpringTransitionConfig) {
    const resolved = resolveTransitionConfig(config);
    if (resolved.kind !== 'spring') {
        throw new Error('expected a spring config');
    }
    return resolved;
}

describe('resolveTransitionConfig (spring)', () => {
    it('applies the documented defaults', () => {
        const resolved = spring({ type: 'spring' });
        expect(resolved.stiffness).toBe(170);
        expect(resolved.damping).toBe(26);
        expect(resolved.mass).toBe(1);
        expect(resolved.restDelta).toBe(0.001);
        expect(resolved.restSpeed).toBe(0.01);
        expect(resolved.substepSeconds).toBe(1 / 120);
    });

    it('shrinks the substep below 1/120s for a spring that semi-implicit Euler cannot integrate stably at 1/120s', () => {
        expect(spring({ type: 'spring', stiffness: 1200, damping: 20 }).substepSeconds).toBe(1 / 120);
        expect(spring({ type: 'spring', stiffness: 100, damping: 300 }).substepSeconds).toBeLessThan(1 / 120);
        expect(spring({ type: 'spring', stiffness: 170, damping: 30, mass: 0.1 }).substepSeconds).toBeLessThan(1 / 120);
        expect(spring({ type: 'spring', stiffness: 200_000 }).substepSeconds).toBeLessThan(1 / 120);
    });

    it('throws on a spring so stiff that a stable substep costs more than a frame can afford', () => {
        expect(() => spring({ type: 'spring', stiffness: 1e12 })).toThrow(/substep/);
        expect(() => spring({ type: 'spring', stiffness: 170, mass: 1e-9 })).toThrow(/substep/);
    });

    it('throws on stiffness <= 0', () => {
        expect(() => spring({ type: 'spring', stiffness: 0 })).toThrow(/stiffness/);
        expect(() => spring({ type: 'spring', stiffness: -5 })).toThrow(/stiffness/);
    });

    it('throws on damping <= 0', () => {
        expect(() => spring({ type: 'spring', damping: -1 })).toThrow(/damping/);
        expect(() => spring({ type: 'spring', damping: 0 })).toThrow(/damping/);
    });

    it('says why an undamped spring is rejected: it never comes to rest, so the loop never idles', () => {
        expect(() => spring({ type: 'spring', damping: 0 })).toThrow(/never comes to rest/);
        expect(() => spring({ type: 'spring', damping: 0 })).toThrow(/render loop awake/);
    });

    it('throws on mass <= 0', () => {
        expect(() => spring({ type: 'spring', mass: 0 })).toThrow(/mass/);
        expect(() => spring({ type: 'spring', mass: -1 })).toThrow(/mass/);
    });

    it('throws on a negative restDelta', () => {
        expect(() => spring({ type: 'spring', restDelta: -0.1 })).toThrow(/restDelta/);
    });

    it('throws on a negative restSpeed', () => {
        expect(() => spring({ type: 'spring', restSpeed: -0.1 })).toThrow(/restSpeed/);
    });

    it('throws on every non-finite field', () => {
        expect(() => spring({ type: 'spring', stiffness: Number.NaN })).toThrow(/stiffness/);
        expect(() => spring({ type: 'spring', stiffness: Number.POSITIVE_INFINITY })).toThrow(/stiffness/);
        expect(() => spring({ type: 'spring', damping: Number.NaN })).toThrow(/damping/);
        expect(() => spring({ type: 'spring', mass: Number.NaN })).toThrow(/mass/);
        expect(() => spring({ type: 'spring', restDelta: Number.NaN })).toThrow(/restDelta/);
        expect(() => spring({ type: 'spring', restSpeed: Number.NaN })).toThrow(/restSpeed/);
    });
});

describe('retargetMotion + sampleMotion (spring)', () => {
    it('converges to the target and settles once every element is under restDelta/restSpeed, snapping to the exact target', () => {
        const config = spring({ type: 'spring' });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        let settled = false;
        let t = 0;
        for (let i = 0; i < 5000 && !settled; i++) {
            t += 16;
            settled = sampleMotion(state, t);
        }

        expect(settled).toBe(true);
        expect(state.settled).toBe(true);
        expect(state.current[0]).toBe(10);
        expect(state.velocity[0]).toBe(0);
    });

    it('overshoots and returns for an underdamped spring, proving the integrator actually ran (a snap cannot do this)', () => {
        const config = spring({ type: 'spring', stiffness: 1200, damping: 20 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        let t = 0;
        let peak = -Infinity;
        for (const step of [25, 25, 25, 25]) {
            t += step;
            sampleMotion(state, t);
            peak = Math.max(peak, state.current[0]);
        }
        expect(peak).toBeGreaterThan(10);

        let trough = Infinity;
        for (const step of [50, 50, 100, 100]) {
            t += step;
            sampleMotion(state, t);
            trough = Math.min(trough, state.current[0]);
        }
        expect(trough).toBeLessThan(10);
    });

    it('a retarget preserves velocity for a spring, unlike a tween (the defining spring property)', () => {
        const config = spring({ type: 'spring', stiffness: 170, damping: 10 });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);

        sampleMotion(state, 0);
        sampleMotion(state, 50);
        sampleMotion(state, 100);

        const velocityBeforeRetarget = state.velocity[0];
        expect(velocityBeforeRetarget).not.toBe(0);
        const currentBeforeRetarget = state.current[0];

        retargetMotion(state, [20], config);

        expect(state.velocity[0]).toBe(velocityBeforeRetarget);
        expect(state.current[0]).toBe(currentBeforeRetarget);
        expect(state.lastTime).toBeNull();
    });

    it('a tween retarget resets velocity to zero, unlike a spring retarget', () => {
        const config = tween({ duration: 100 });
        const state = createMotionState(config, new Float32Array([0]));
        state.velocity[0] = 5;

        retargetMotion(state, [10], config);

        expect(state.velocity[0]).toBe(0);
    });

    it('clamps the dt of a 10-second idle gap to 100ms, so a post-idle wake does not explode', () => {
        const config = spring({ type: 'spring' });

        const wokeAfterTenSeconds = createMotionState(config, new Float32Array([0]));
        retargetMotion(wokeAfterTenSeconds, [10], config);
        sampleMotion(wokeAfterTenSeconds, 0);
        sampleMotion(wokeAfterTenSeconds, 10_000);

        const sampledAtOneHundredMs = createMotionState(config, new Float32Array([0]));
        retargetMotion(sampledAtOneHundredMs, [10], config);
        sampleMotion(sampledAtOneHundredMs, 0);
        sampleMotion(sampledAtOneHundredMs, 100);

        expect(Number.isFinite(wokeAfterTenSeconds.current[0])).toBe(true);
        expect(wokeAfterTenSeconds.current[0]).toBe(sampledAtOneHundredMs.current[0]);
    });

    it('fixed 1/120s substeps keep a coarse 66ms sampling cadence close to a fine 1ms reference, instead of diverging into instability', () => {
        const config = spring({ type: 'spring', stiffness: 1200, damping: 20 });

        const coarse = createMotionState(config, new Float32Array([0]));
        retargetMotion(coarse, [10], config);
        let tCoarse = 0;
        for (let i = 0; i < 6; i++) {
            tCoarse += 66;
            sampleMotion(coarse, tCoarse);
        }

        const fine = createMotionState(config, new Float32Array([0]));
        retargetMotion(fine, [10], config);
        for (let tFine = 1; tFine <= tCoarse; tFine++) {
            sampleMotion(fine, tFine);
        }

        expect(Number.isFinite(coarse.current[0])).toBe(true);
        expect(Math.abs(coarse.current[0] - fine.current[0])).toBeLessThan(1);
    });

    it('is deterministic: replaying the same time sequence produces bit-identical output', () => {
        const config = spring({ type: 'spring' });
        const timeSequence = [0, 16, 33, 50, 90, 140, 260, 500];

        const run = (): number[] => {
            const state = createMotionState(config, new Float32Array([0]));
            retargetMotion(state, [10], config);
            return timeSequence.map(t => {
                sampleMotion(state, t);
                return state.current[0];
            });
        };

        expect(run()).toEqual(run());
    });

    it.each([
        ['heavily damped', { type: 'spring', stiffness: 100, damping: 300 }],
        ['light mass, ordinary damping', { type: 'spring', stiffness: 170, damping: 30, mass: 0.1 }],
        ['very stiff', { type: 'spring', stiffness: 200_000, damping: 26 }],
        ['very stiff and heavily damped', { type: 'spring', stiffness: 200_000, damping: 4000 }]
    ] satisfies [string, SpringTransitionConfig][])(
        'a %s spring stays inside a sane envelope on every frame instead of diverging into garbage uploads',
        (_label, config) => {
            const resolved = spring(config);
            const state = createMotionState(resolved, new Float32Array([0]));
            retargetMotion(state, [10], resolved);

            const trajectory: number[] = [];
            let settled = false;
            let t = 0;
            for (let i = 0; i < 3000 && !settled; i++) {
                t += 16;
                settled = sampleMotion(state, t);
                trajectory.push(state.current[0]);
            }

            expect(trajectory.every(value => Number.isFinite(value))).toBe(true);
            expect(Math.min(...trajectory)).toBeGreaterThan(-5);
            expect(Math.max(...trajectory)).toBeLessThan(25);
            expect(settled).toBe(true);
            expect(state.current[0]).toBe(10);
        }
    );

    it('a non-finite velocity can never masquerade as a settled spring (NaN fails every rest comparison)', () => {
        const config = spring({ type: 'spring' });
        const state = createMotionState(config, new Float32Array([0]));
        retargetMotion(state, [10], config);
        sampleMotion(state, 0);

        state.velocity[0] = Number.NaN;
        state.current[0] = Number.NaN;

        expect(sampleMotion(state, 16)).toBe(false);
        expect(state.settled).toBe(false);
        expect(state.current[0]).not.toBe(10);
    });
});
