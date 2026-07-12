import { describe, expect, it } from 'vitest';

import type { MotionGate } from '@/react/lib/motionPolicy';
import type { ScheduleInputs } from '@/react/lib/shouldSchedule';
import { shouldSchedule } from '@/react/lib/shouldSchedule';
import type { Frameloop } from '@/types';

const FRAMELOOPS: Frameloop[] = ['always', 'demand', 'never'];
const BOOLS = [true, false];
const SPEEDS = [1, 0];
const MOTION_GATES: MotionGate[] = ['none', 'pause', 'static'];

function expected(inputs: ScheduleInputs): boolean {
    if (inputs.pauseWhenHidden && (!inputs.documentVisible || !inputs.intersecting)) {
        return false;
    }
    if (inputs.speed === 0) {
        return false;
    }
    if (inputs.motionGate !== 'none') {
        return inputs.pendingInvalidate;
    }
    if (inputs.frameloop === 'always') {
        return true;
    }
    return inputs.pendingInvalidate;
}

describe('shouldSchedule truth table', () => {
    it('matches the reference across every input combination', () => {
        for (const frameloop of FRAMELOOPS) {
            for (const speed of SPEEDS) {
                for (const documentVisible of BOOLS) {
                    for (const intersecting of BOOLS) {
                        for (const pauseWhenHidden of BOOLS) {
                            for (const pendingInvalidate of BOOLS) {
                                for (const motionGate of MOTION_GATES) {
                                    const inputs: ScheduleInputs = {
                                        frameloop, speed, documentVisible,
                                        intersecting, pauseWhenHidden, pendingInvalidate,
                                        motionGate
                                    };
                                    expect(shouldSchedule(inputs)).toBe(expected(inputs));
                                }
                            }
                        }
                    }
                }
            }
        }
    });
});

const base: ScheduleInputs = {
    frameloop: 'always',
    speed: 1,
    documentVisible: true,
    intersecting: true,
    pauseWhenHidden: true,
    pendingInvalidate: false,
    motionGate: 'none'
};

describe('shouldSchedule precedence', () => {
    it('schedules always mode when visible at nonzero speed', () => {
        expect(shouldSchedule(base)).toBe(true);
    });

    it('hidden document overrides always mode', () => {
        expect(shouldSchedule({ ...base, documentVisible: false })).toBe(false);
    });

    it('offscreen canvas overrides always mode', () => {
        expect(shouldSchedule({ ...base, intersecting: false })).toBe(false);
    });

    it('pauseWhenHidden false ignores hidden document and offscreen canvas', () => {
        expect(shouldSchedule({
            ...base, documentVisible: false, intersecting: false, pauseWhenHidden: false
        })).toBe(true);
    });

    it('speed zero fully stops scheduling even in always mode', () => {
        expect(shouldSchedule({ ...base, speed: 0 })).toBe(false);
    });

    it('negative speed still schedules', () => {
        expect(shouldSchedule({ ...base, speed: -1 })).toBe(true);
    });

    it('demand mode schedules only when an invalidate is pending', () => {
        expect(shouldSchedule({ ...base, frameloop: 'demand', pendingInvalidate: false })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'demand', pendingInvalidate: true })).toBe(true);
    });

    it('never mode schedules only when an invalidate is pending', () => {
        expect(shouldSchedule({ ...base, frameloop: 'never', pendingInvalidate: false })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'never', pendingInvalidate: true })).toBe(true);
    });

    it('hidden overrides a pending invalidate in demand mode', () => {
        expect(shouldSchedule({
            ...base, frameloop: 'demand', pendingInvalidate: true, documentVisible: false
        })).toBe(false);
    });

    it('a motion gate suppresses continuous scheduling in always mode', () => {
        expect(shouldSchedule({ ...base, motionGate: 'static' })).toBe(false);
        expect(shouldSchedule({ ...base, motionGate: 'pause' })).toBe(false);
    });

    it('a motion gate still allows one coalesced repaint per invalidate', () => {
        expect(shouldSchedule({ ...base, motionGate: 'static', pendingInvalidate: true })).toBe(true);
        expect(shouldSchedule({ ...base, motionGate: 'pause', pendingInvalidate: true })).toBe(true);
    });

    it('hidden still wins over a motion gate with a pending invalidate', () => {
        expect(shouldSchedule({
            ...base, motionGate: 'static', pendingInvalidate: true, documentVisible: false
        })).toBe(false);
    });

    it('speed zero still wins over a motion gate with a pending invalidate', () => {
        expect(shouldSchedule({
            ...base, motionGate: 'static', pendingInvalidate: true, speed: 0
        })).toBe(false);
    });

    it('motionGate none preserves the pre-gate always/demand/never behavior', () => {
        expect(shouldSchedule({ ...base, motionGate: 'none' })).toBe(true);
        expect(shouldSchedule({ ...base, frameloop: 'demand', motionGate: 'none', pendingInvalidate: false })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'demand', motionGate: 'none', pendingInvalidate: true })).toBe(true);
    });
});
