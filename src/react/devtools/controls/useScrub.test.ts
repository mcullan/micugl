import { describe, expect, it } from 'vitest';

import {
    accumulateMovement,
    computeDragValue,
    crossesThreshold,
    DEFAULT_PX_PER_STEP,
    DEFAULT_THRESHOLD_PX,
    IDLE_SCRUB_STATE,
    negateDrag,
    normalizeZero,
    promoteToDragging,
    resetScrub,
    type ScrubModifiers,
    startMaybeDrag
} from '@/react/devtools/controls/useScrub';

const NO_MODIFIERS: ScrubModifiers = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };

describe('normalizeZero', () => {
    it('collapses negative zero to zero', () => {
        expect(Object.is(normalizeZero(-0), -0)).toBe(false);
        expect(normalizeZero(-0)).toBe(0);
    });

    it('leaves other values untouched', () => {
        expect(normalizeZero(3.5)).toBe(3.5);
        expect(normalizeZero(-3.5)).toBe(-3.5);
    });
});

describe('startMaybeDrag', () => {
    it('enters maybe-drag with a zero accumulator', () => {
        const state = startMaybeDrag(100, 5);
        expect(state).toEqual({ mode: 'maybe-drag', startClientX: 100, startValue: 5, accumPx: 0 });
    });
});

describe('crossesThreshold', () => {
    it('is false below the threshold', () => {
        const state = startMaybeDrag(100, 5);
        expect(crossesThreshold(state, 102, DEFAULT_THRESHOLD_PX)).toBe(false);
    });

    it('is true once movement exceeds the threshold', () => {
        const state = startMaybeDrag(100, 5);
        expect(crossesThreshold(state, 104, DEFAULT_THRESHOLD_PX)).toBe(true);
        expect(crossesThreshold(state, 96, DEFAULT_THRESHOLD_PX)).toBe(true);
    });

    it('is false outside of maybe-drag mode', () => {
        expect(crossesThreshold(IDLE_SCRUB_STATE, 999, DEFAULT_THRESHOLD_PX)).toBe(false);
    });
});

describe('promoteToDragging', () => {
    it('seeds accumPx from the crossing distance', () => {
        const maybeDrag = startMaybeDrag(100, 5);
        const dragging = promoteToDragging(maybeDrag, 108);
        expect(dragging.mode).toBe('dragging');
        expect(dragging.accumPx).toBe(8);
        expect(dragging.startValue).toBe(5);
    });
});

describe('accumulateMovement', () => {
    it('adds movementX while dragging', () => {
        const dragging = promoteToDragging(startMaybeDrag(0, 0), 4);
        const next = accumulateMovement(dragging, 10);
        expect(next.accumPx).toBe(14);
    });

    it('is a no-op outside dragging mode', () => {
        expect(accumulateMovement(IDLE_SCRUB_STATE, 10)).toBe(IDLE_SCRUB_STATE);
        const maybeDrag = startMaybeDrag(0, 0);
        expect(accumulateMovement(maybeDrag, 10)).toBe(maybeDrag);
    });
});

describe('computeDragValue', () => {
    it('applies continuous movement at the base rate', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: DEFAULT_PX_PER_STEP };
        const value = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, NO_MODIFIERS);
        expect(value).toBeCloseTo(11);
    });

    it('shift scales the rate by 0.1 (precision mode)', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: DEFAULT_PX_PER_STEP };
        const value = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, { ...NO_MODIFIERS, shiftKey: true });
        expect(value).toBeCloseTo(10.1);
    });

    it('ctrl/cmd snaps the result to the effective step grid', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: DEFAULT_PX_PER_STEP * 2.4 };
        const value = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, { ...NO_MODIFIERS, ctrlKey: true });
        expect(value).toBeCloseTo(12);
    });

    it('shift+ctrl snaps to the fine grid', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: DEFAULT_PX_PER_STEP * 2.3 };
        const value = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, { shiftKey: true, ctrlKey: true, metaKey: false, altKey: false });
        expect(value).toBeCloseTo(10.2);
    });

    it('metaKey behaves the same as ctrlKey for snapping', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 0, accumPx: DEFAULT_PX_PER_STEP * 2.4 };
        const ctrl = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, { ...NO_MODIFIERS, ctrlKey: true });
        const meta = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, { ...NO_MODIFIERS, metaKey: true });
        expect(meta).toBe(ctrl);
    });

    it('negative movement decreases the value', () => {
        const state = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: -DEFAULT_PX_PER_STEP };
        const value = computeDragValue(state, 1, DEFAULT_PX_PER_STEP, NO_MODIFIERS);
        expect(value).toBeCloseTo(9);
    });
});

describe('negateDrag', () => {
    it('negates the in-progress value and resets the accumulator', () => {
        const dragging = { mode: 'dragging' as const, startClientX: 0, startValue: 10, accumPx: 12 };
        const negated = negateDrag(dragging, 11);
        expect(negated.startValue).toBe(-11);
        expect(negated.accumPx).toBe(0);
        expect(negated.mode).toBe('dragging');
    });

    it('is a no-op outside dragging mode', () => {
        expect(negateDrag(IDLE_SCRUB_STATE, 5)).toBe(IDLE_SCRUB_STATE);
    });
});

describe('resetScrub', () => {
    it('returns the idle state', () => {
        expect(resetScrub()).toEqual(IDLE_SCRUB_STATE);
    });
});

describe('threshold-then-drag integration (plain-object events)', () => {
    it('does not cross into dragging until movement exceeds the pixel threshold', () => {
        const pointerDown = { clientX: 200 };
        let state = startMaybeDrag(pointerDown.clientX, 3);

        const smallMove = { clientX: 201 };
        expect(crossesThreshold(state, smallMove.clientX)).toBe(false);

        const bigMove = { clientX: 206 };
        expect(crossesThreshold(state, bigMove.clientX)).toBe(true);
        state = promoteToDragging(state, bigMove.clientX);
        expect(state.mode).toBe('dragging');
    });
});
