import type { Frameloop } from '@/types';

export interface ScheduleInputs {
    frameloop: Frameloop;
    speed: number;
    documentVisible: boolean;
    intersecting: boolean;
    pauseWhenHidden: boolean;
    pendingInvalidate: boolean;
}

export function shouldSchedule(inputs: ScheduleInputs): boolean {
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
