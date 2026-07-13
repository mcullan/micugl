import { resolveEasing } from '@/core/lib/easing';
import type { EasingFn, UniformTransitionConfig } from '@/types';

export interface ResolvedTweenConfig {
    duration: number;
    delay: number;
    easing: EasingFn;
    interpolate?: (from: ArrayLike<number>, to: ArrayLike<number>, t: number, out: Float32Array) => void;
}

export type ResolvedTransitionConfig = ResolvedTweenConfig;

export interface MotionState {
    from: Float32Array;
    to: Float32Array;
    current: Float32Array;
    startTime: number | null;
    settled: boolean;
    config: ResolvedTransitionConfig;
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function lerpInto(from: Float32Array, to: Float32Array, t: number, out: Float32Array): void {
    for (let i = 0; i < out.length; i++) {
        out[i] = from[i] + (to[i] - from[i]) * t;
    }
}

export function resolveTransitionConfig(config: UniformTransitionConfig): ResolvedTransitionConfig {
    const duration = config.duration;
    if (!Number.isFinite(duration) || duration < 0) {
        throw new Error(
            `micugl transitions: "duration" must be a finite number >= 0, received ${JSON.stringify(duration)}`
        );
    }

    const delay = config.delay ?? 0;
    if (!Number.isFinite(delay) || delay < 0) {
        throw new Error(
            `micugl transitions: "delay" must be a finite number >= 0, received ${JSON.stringify(delay)}`
        );
    }

    return {
        duration,
        delay,
        easing: resolveEasing(config.easing),
        interpolate: config.interpolate
    };
}

export function createMotionState(config: ResolvedTransitionConfig, initial: Float32Array): MotionState {
    return {
        from: initial.slice(),
        to: initial.slice(),
        current: initial.slice(),
        startTime: null,
        settled: true,
        config
    };
}

export function retargetMotion(
    state: MotionState,
    target: ArrayLike<number>,
    config: ResolvedTransitionConfig
): void {
    state.from.set(state.current);
    state.to.set(target);
    state.startTime = null;
    state.settled = false;
    state.config = config;
}

export function sampleMotion(state: MotionState, timeMs: number): boolean {
    if (state.settled) {
        return true;
    }

    const { duration, delay, easing, interpolate } = state.config;

    state.startTime ??= timeMs;

    const elapsed = timeMs - state.startTime;
    const t = duration <= 0 ? 1 : clamp01((elapsed - delay) / duration);
    const easedT = easing(t);

    if (interpolate) {
        interpolate(state.from, state.to, easedT, state.current);
    } else {
        lerpInto(state.from, state.to, easedT, state.current);
    }

    if (t >= 1) {
        state.current.set(state.to);
        state.settled = true;
        return true;
    }

    return false;
}
