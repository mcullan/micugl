import { describe, expect, it } from 'vitest';

import type { MotionGate, MotionGateInputs } from '@/react/lib/motionPolicy';
import { resolveMotionGate } from '@/react/lib/motionPolicy';
import type { MotionPolicy } from '@/types';

const POLICIES: MotionPolicy[] = ['static-frame', 'pause', 'ignore'];
const BOOLS = [true, false];

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

function expected(inputs: MotionGateInputs): MotionGate {
    const reducedMotionGate = inputs.reducedMotionActive ? gateForPolicy(inputs.reducedMotion) : 'none';
    const saveDataGate = inputs.saveDataActive ? gateForPolicy(inputs.saveData) : 'none';
    return mostRestrictive(reducedMotionGate, saveDataGate);
}

describe('resolveMotionGate truth table', () => {
    it('matches the reference across every policy and activation combination', () => {
        for (const reducedMotion of POLICIES) {
            for (const saveData of POLICIES) {
                for (const reducedMotionActive of BOOLS) {
                    for (const saveDataActive of BOOLS) {
                        const inputs: MotionGateInputs = {
                            reducedMotionActive, saveDataActive, reducedMotion, saveData
                        };
                        expect(resolveMotionGate(inputs)).toBe(expected(inputs));
                    }
                }
            }
        }
    });
});

describe('resolveMotionGate precedence', () => {
    it('is none when neither axis is active regardless of configured policy', () => {
        expect(resolveMotionGate({
            reducedMotionActive: false,
            saveDataActive: false,
            reducedMotion: 'static-frame',
            saveData: 'static-frame'
        })).toBe('none');
    });

    it('an inactive axis never contributes even when set to static-frame', () => {
        expect(resolveMotionGate({
            reducedMotionActive: false,
            saveDataActive: true,
            reducedMotion: 'static-frame',
            saveData: 'ignore'
        })).toBe('none');
    });

    it('ignore contributes nothing even when active', () => {
        expect(resolveMotionGate({
            reducedMotionActive: true,
            saveDataActive: false,
            reducedMotion: 'ignore',
            saveData: 'static-frame'
        })).toBe('none');
    });

    it('static beats pause when both axes are active', () => {
        expect(resolveMotionGate({
            reducedMotionActive: true,
            saveDataActive: true,
            reducedMotion: 'pause',
            saveData: 'static-frame'
        })).toBe('static');

        expect(resolveMotionGate({
            reducedMotionActive: true,
            saveDataActive: true,
            reducedMotion: 'static-frame',
            saveData: 'pause'
        })).toBe('static');
    });

    it('pause wins over ignore when both axes are active', () => {
        expect(resolveMotionGate({
            reducedMotionActive: true,
            saveDataActive: true,
            reducedMotion: 'pause',
            saveData: 'ignore'
        })).toBe('pause');
    });

    it('a single active axis drives the gate on its own', () => {
        expect(resolveMotionGate({
            reducedMotionActive: true,
            saveDataActive: false,
            reducedMotion: 'static-frame',
            saveData: 'static-frame'
        })).toBe('static');

        expect(resolveMotionGate({
            reducedMotionActive: false,
            saveDataActive: true,
            reducedMotion: 'static-frame',
            saveData: 'pause'
        })).toBe('pause');
    });
});
