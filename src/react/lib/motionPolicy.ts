import type { MotionPolicy } from '@/types';

export type MotionGate = 'none' | 'pause' | 'static';

export const DEFAULT_MOTION_POLICY: MotionPolicy = 'static-frame';

function gateForPolicy(policy: MotionPolicy): MotionGate {
    if (policy === 'static-frame') {
        return 'static';
    }
    if (policy === 'pause') {
        return 'pause';
    }
    return 'none';
}

function mostRestrictive(a: MotionGate, b: MotionGate): MotionGate {
    if (a === 'static' || b === 'static') {
        return 'static';
    }
    if (a === 'pause' || b === 'pause') {
        return 'pause';
    }
    return 'none';
}

export interface MotionGateInputs {
    reducedMotionActive: boolean;
    saveDataActive: boolean;
    reducedMotion: MotionPolicy;
    saveData: MotionPolicy;
}

export function resolveMotionGate(inputs: MotionGateInputs): MotionGate {
    const reducedMotionGate = inputs.reducedMotionActive ? gateForPolicy(inputs.reducedMotion) : 'none';
    const saveDataGate = inputs.saveDataActive ? gateForPolicy(inputs.saveData) : 'none';
    return mostRestrictive(reducedMotionGate, saveDataGate);
}
