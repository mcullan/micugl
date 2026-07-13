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
        return inputs.pendingDiscrete;
    }
    if (inputs.frameloop === 'always') {
        return true;
    }
    return inputs.pendingDiscrete || inputs.pendingContinuous;
}

describe('shouldSchedule truth table', () => {
    it('matches the reference across every input combination', () => {
        for (const frameloop of FRAMELOOPS) {
            for (const speed of SPEEDS) {
                for (const documentVisible of BOOLS) {
                    for (const intersecting of BOOLS) {
                        for (const pauseWhenHidden of BOOLS) {
                            for (const pendingDiscrete of BOOLS) {
                                for (const pendingContinuous of BOOLS) {
                                    for (const motionGate of MOTION_GATES) {
                                        const inputs: ScheduleInputs = {
                                            frameloop, speed, documentVisible,
                                            intersecting, pauseWhenHidden,
                                            pendingDiscrete, pendingContinuous,
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
        }
    });
});

const base: ScheduleInputs = {
    frameloop: 'always',
    speed: 1,
    documentVisible: true,
    intersecting: true,
    pauseWhenHidden: true,
    pendingDiscrete: false,
    pendingContinuous: false,
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

    it('demand mode schedules on a pending discrete or continuous request', () => {
        expect(shouldSchedule({ ...base, frameloop: 'demand' })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'demand', pendingDiscrete: true })).toBe(true);
        expect(shouldSchedule({ ...base, frameloop: 'demand', pendingContinuous: true })).toBe(true);
    });

    it('never mode schedules on a pending discrete or continuous request', () => {
        expect(shouldSchedule({ ...base, frameloop: 'never' })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'never', pendingDiscrete: true })).toBe(true);
        expect(shouldSchedule({ ...base, frameloop: 'never', pendingContinuous: true })).toBe(true);
    });

    it('hidden overrides a pending request in demand mode', () => {
        expect(shouldSchedule({
            ...base, frameloop: 'demand', pendingDiscrete: true, documentVisible: false
        })).toBe(false);
    });

    it('a motion gate suppresses continuous scheduling in always mode', () => {
        expect(shouldSchedule({ ...base, motionGate: 'static' })).toBe(false);
        expect(shouldSchedule({ ...base, motionGate: 'pause' })).toBe(false);
    });

    it('a motion gate schedules on a pending discrete request but never on a continuous one', () => {
        expect(shouldSchedule({ ...base, motionGate: 'static', pendingDiscrete: true })).toBe(true);
        expect(shouldSchedule({ ...base, motionGate: 'pause', pendingDiscrete: true })).toBe(true);
        expect(shouldSchedule({ ...base, motionGate: 'static', pendingContinuous: true })).toBe(false);
        expect(shouldSchedule({ ...base, motionGate: 'pause', pendingContinuous: true })).toBe(false);
    });

    it('a continuous request alongside a discrete one still schedules under a gate', () => {
        expect(shouldSchedule({
            ...base, motionGate: 'static', pendingDiscrete: true, pendingContinuous: true
        })).toBe(true);
    });

    it('hidden still wins over a motion gate with a pending discrete request', () => {
        expect(shouldSchedule({
            ...base, motionGate: 'static', pendingDiscrete: true, documentVisible: false
        })).toBe(false);
    });

    it('speed zero still wins over a motion gate with a pending discrete request', () => {
        expect(shouldSchedule({
            ...base, motionGate: 'static', pendingDiscrete: true, speed: 0
        })).toBe(false);
    });

    it('motionGate none preserves the pre-gate always/demand/never behavior', () => {
        expect(shouldSchedule({ ...base, motionGate: 'none' })).toBe(true);
        expect(shouldSchedule({ ...base, frameloop: 'demand', motionGate: 'none' })).toBe(false);
        expect(shouldSchedule({ ...base, frameloop: 'demand', motionGate: 'none', pendingContinuous: true })).toBe(true);
        expect(shouldSchedule({ ...base, frameloop: 'demand', motionGate: 'none', pendingDiscrete: true })).toBe(true);
    });
});
