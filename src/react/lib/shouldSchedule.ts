import type { MotionGate } from '@/react/lib/motionPolicy';
import type { Frameloop } from '@/types';

export interface ScheduleInputs {
    frameloop: Frameloop;
    speed: number;
    documentVisible: boolean;
    intersecting: boolean;
    pauseWhenHidden: boolean;
    pendingInvalidate: boolean;
    motionGate: MotionGate;
}

export function shouldSchedule(inputs: ScheduleInputs): boolean {
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
