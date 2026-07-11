import { describe, expect, it } from 'vitest';

import type { EngineDebugState } from '@/react/devtools/beacon';
import { isEngineStateUnavailable } from '@/react/devtools/lib/engineState';

const baseState = (): EngineDebugState => ({
    kind: 'shader',
    id: 'engine-a',
    canvas: { renderWidth: 0, renderHeight: 0, displayWidth: 0, displayHeight: 0 },
    programIds: [],
    framebufferIds: [],
    capabilities: {
        floatRenderable: false,
        halfFloatRenderable: false,
        floatLinearFilterable: false,
        halfFloatLinearFilterable: false,
        halfFloatType: 0
    },
    floatFilterDowngraded: false
});

describe('isEngineStateUnavailable', () => {
    it('flags the zeroed empty fallback as unavailable', () => {
        expect(isEngineStateUnavailable(baseState())).toBe(true);
    });

    it('treats a state with programs as available', () => {
        const state = baseState();
        state.programIds = ['main'];
        expect(isEngineStateUnavailable(state)).toBe(false);
    });

    it('treats a state with a sized canvas as available', () => {
        const state = baseState();
        state.canvas = { renderWidth: 320, renderHeight: 240, displayWidth: 320, displayHeight: 240 };
        expect(isEngineStateUnavailable(state)).toBe(false);
    });

    it('treats a state with framebuffers as available', () => {
        const state = baseState();
        state.framebufferIds = ['ping'];
        expect(isEngineStateUnavailable(state)).toBe(false);
    });
});
