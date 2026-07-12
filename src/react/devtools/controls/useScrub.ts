import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ScrubMode = 'idle' | 'maybe-drag' | 'dragging';

export interface ScrubModifiers {
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}

export interface ScrubState {
    mode: ScrubMode;
    startClientX: number;
    startValue: number;
    accumPx: number;
}

export const DEFAULT_THRESHOLD_PX = 3;
export const DEFAULT_PX_PER_STEP = 6;

export const IDLE_SCRUB_STATE: ScrubState = {
    mode: 'idle',
    startClientX: 0,
    startValue: 0,
    accumPx: 0
};

export function normalizeZero(value: number): number {
    return value === 0 ? 0 : value;
}

export function startMaybeDrag(clientX: number, value: number): ScrubState {
    return { mode: 'maybe-drag', startClientX: clientX, startValue: value, accumPx: 0 };
}

export function crossesThreshold(
    state: ScrubState,
    clientX: number,
    threshold: number = DEFAULT_THRESHOLD_PX
): boolean {
    return state.mode === 'maybe-drag' && Math.abs(clientX - state.startClientX) > threshold;
}

export function promoteToDragging(state: ScrubState, clientX: number): ScrubState {
    return { ...state, mode: 'dragging', accumPx: clientX - state.startClientX };
}

export function accumulateMovement(state: ScrubState, movementX: number): ScrubState {
    return state.mode === 'dragging' ? { ...state, accumPx: state.accumPx + movementX } : state;
}

export function computeDragValue(
    state: ScrubState,
    step: number,
    pxPerStep: number,
    modifiers: ScrubModifiers
): number {
    const precision = modifiers.shiftKey ? 0.1 : 1;
    const effStep = step * precision;
    let next = state.startValue + (state.accumPx / pxPerStep) * effStep;
    if ((modifiers.ctrlKey || modifiers.metaKey) && effStep !== 0) {
        next = Math.round(next / effStep) * effStep;
    }
    return normalizeZero(next);
}

export function negateDrag(state: ScrubState, currentValue: number): ScrubState {
    return state.mode === 'dragging'
        ? { ...state, startValue: normalizeZero(-currentValue), accumPx: 0 }
        : state;
}

export function resetScrub(): ScrubState {
    return IDLE_SCRUB_STATE;
}

export type ScrubPointerUpOutcome = 'commit' | 'tap' | 'none';

export interface UseScrubOptions {
    value: number;
    step: number;
    onChange: (value: number, modifiers?: ScrubModifiers) => void;
    pxPerStep?: number;
    threshold?: number;
}

export interface UseScrubResult {
    dragging: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => ScrubPointerUpOutcome;
    negate: () => boolean;
}

export function useScrub({
    value,
    step,
    onChange,
    pxPerStep = DEFAULT_PX_PER_STEP,
    threshold = DEFAULT_THRESHOLD_PX
}: UseScrubOptions): UseScrubResult {
    const [dragging, setDragging] = useState(false);
    const stateRef = useRef<ScrubState>(IDLE_SCRUB_STATE);
    const valueRef = useRef(value);
    const stepRef = useRef(step);
    const currentValueRef = useRef(value);
    const originalValueRef = useRef(value);
    const lockedRef = useRef(false);
    const elementRef = useRef<HTMLElement | null>(null);

    valueRef.current = value;
    stepRef.current = step;

    const applyValue = useCallback((modifiers: ScrubModifiers): void => {
        const next = computeDragValue(stateRef.current, stepRef.current, pxPerStep, modifiers);
        currentValueRef.current = next;
        onChange(next, modifiers);
    }, [onChange, pxPerStep]);

    const endDrag = useCallback((): void => {
        if (lockedRef.current && typeof document !== 'undefined') {
            document.exitPointerLock();
        }
        lockedRef.current = false;
        elementRef.current = null;
        stateRef.current = resetScrub();
        setDragging(false);
    }, []);

    const requestLock = useCallback((element: HTMLElement): void => {
        if (typeof element.requestPointerLock !== 'function') {
            return;
        }
        try {
            const result = element.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
            if (typeof result !== 'undefined') {
                void result
                    .then(() => {
                        lockedRef.current = document.pointerLockElement === element;
                    })
                    .catch((error: unknown) => {
                        if (error instanceof DOMException && error.name === 'NotSupportedError') {
                            try {
                                void element.requestPointerLock()
                                    .then(() => {
                                        lockedRef.current = document.pointerLockElement === element;
                                    })
                                    .catch(() => {
                                        lockedRef.current = false;
                                    });
                            } catch {
                                lockedRef.current = false;
                            }
                        } else {
                            lockedRef.current = false;
                        }
                    });
            } else {
                lockedRef.current = document.pointerLockElement === element;
            }
        } catch {
            lockedRef.current = false;
        }
    }, []);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
        if (event.button !== 0) {
            return;
        }
        const target = event.currentTarget;
        elementRef.current = target;
        target.setPointerCapture(event.pointerId);
        stateRef.current = startMaybeDrag(event.clientX, valueRef.current);
        originalValueRef.current = valueRef.current;
        currentValueRef.current = valueRef.current;
    }, []);

    const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
        const state = stateRef.current;
        const modifiers: ScrubModifiers = {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey
        };
        if (state.mode === 'idle') {
            return;
        }
        if (state.mode === 'maybe-drag') {
            if (crossesThreshold(state, event.clientX, threshold)) {
                stateRef.current = promoteToDragging(state, event.clientX);
                setDragging(true);
                requestLock(event.currentTarget);
                applyValue(modifiers);
            }
            return;
        }
        stateRef.current = accumulateMovement(state, event.movementX);
        applyValue(modifiers);
    }, [applyValue, requestLock, threshold]);

    const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>): ScrubPointerUpOutcome => {
        const state = stateRef.current;
        if (state.mode === 'dragging') {
            event.currentTarget.releasePointerCapture(event.pointerId);
            endDrag();
            return 'commit';
        }
        if (state.mode === 'maybe-drag') {
            event.currentTarget.releasePointerCapture(event.pointerId);
            stateRef.current = resetScrub();
            return 'tap';
        }
        return 'none';
    }, [endDrag]);

    const negate = useCallback((): boolean => {
        if (stateRef.current.mode !== 'dragging') {
            return false;
        }
        stateRef.current = negateDrag(stateRef.current, currentValueRef.current);
        const negated = normalizeZero(-currentValueRef.current);
        currentValueRef.current = negated;
        onChange(negated);
        return true;
    }, [onChange]);

    useEffect(() => {
        if (!dragging || typeof document === 'undefined') {
            return;
        }
        const onLockChange = (): void => {
            const element = elementRef.current;
            if (element && lockedRef.current && document.pointerLockElement !== element) {
                lockedRef.current = false;
                onChange(originalValueRef.current);
                endDrag();
            }
        };
        document.addEventListener('pointerlockchange', onLockChange);
        return () => { document.removeEventListener('pointerlockchange', onLockChange) };
    }, [dragging, endDrag, onChange]);

    return { dragging, onPointerDown, onPointerMove, onPointerUp, negate };
}
