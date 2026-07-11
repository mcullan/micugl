import { describe, expect, it } from 'vitest';

import type { ScheduleInputs } from '@/react/lib/shouldSchedule';
import { shouldSchedule } from '@/react/lib/shouldSchedule';
import type { Frameloop } from '@/types';

const FRAMELOOPS: Frameloop[] = ['always', 'demand', 'never'];
const BOOLS = [true, false];
const SPEEDS = [1, 0];

function expected(inputs: ScheduleInputs): boolean {
    if (inputs.pauseWhenHidden && (!inputs.documentVisible || !inputs.intersecting)) {
        return false;
    }
    if (inputs.speed === 0) {
        return false;
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
                                const inputs: ScheduleInputs = {
                                    frameloop, speed, documentVisible,
                                    intersecting, pauseWhenHidden, pendingInvalidate
                                };
                                expect(shouldSchedule(inputs)).toBe(expected(inputs));
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
    pendingInvalidate: false
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
});
