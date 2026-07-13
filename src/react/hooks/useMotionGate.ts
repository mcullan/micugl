import { useReducedMotion } from '@/react/hooks/useReducedMotion';
import { useSaveData } from '@/react/hooks/useSaveData';
import { DEFAULT_MOTION_POLICY, type MotionGate, resolveMotionGate } from '@/react/lib/motionPolicy';
import type { MotionPolicy } from '@/types';

export function useMotionGate(reducedMotion?: MotionPolicy, saveData?: MotionPolicy): MotionGate {
    const reducedMotionActive = useReducedMotion();
    const saveDataActive = useSaveData();
    return resolveMotionGate({
        reducedMotionActive,
        saveDataActive,
        reducedMotion: reducedMotion ?? DEFAULT_MOTION_POLICY,
        saveData: saveData ?? DEFAULT_MOTION_POLICY
    });
}
