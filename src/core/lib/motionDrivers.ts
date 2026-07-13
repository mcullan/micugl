import { resolveEasing } from '@/core/lib/easing';
import type {
    EasingFn,
    SpringTransitionConfig,
    TweenTransitionConfig,
    UniformTransitionConfig
} from '@/types';

export interface ResolvedTweenConfig {
    kind: 'tween';
    duration: number;
    delay: number;
    easing: EasingFn;
    interpolate?: (from: ArrayLike<number>, to: ArrayLike<number>, t: number, out: Float32Array) => void;
}

export interface ResolvedSpringConfig {
    kind: 'spring';
    stiffness: number;
    damping: number;
    mass: number;
    restDelta: number;
    restSpeed: number;
    substepSeconds: number;
}

export type ResolvedTransitionConfig = ResolvedTweenConfig | ResolvedSpringConfig;

export interface MotionState {
    from: Float32Array;
    to: Float32Array;
    current: Float32Array;
    velocity: Float32Array;
    startTime: number | null;
    lastTime: number | null;
    settled: boolean;
    config: ResolvedTransitionConfig;
}

const SPRING_SUBSTEP_SECONDS = 1 / 120;
const SPRING_MAX_DT_SECONDS = 0.1;
const SPRING_STABILITY_MARGIN = 0.5;
const SPRING_MAX_SUBSTEPS_PER_FRAME = 1000;

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

function springSubstepSeconds(stiffness: number, damping: number, mass: number): number {
    const omegaSquared = stiffness / mass;
    const dampingRate = damping / mass;
    const stabilityLimit =
        (Math.sqrt(dampingRate * dampingRate + 4 * omegaSquared) - dampingRate) / omegaSquared;

    return Math.min(SPRING_SUBSTEP_SECONDS, stabilityLimit * SPRING_STABILITY_MARGIN);
}

function resolveSpringConfig(config: SpringTransitionConfig): ResolvedSpringConfig {
    const stiffness = config.stiffness ?? 170;
    if (!Number.isFinite(stiffness) || stiffness <= 0) {
        throw new Error(
            `micugl transitions: "stiffness" must be a finite number > 0, received ${JSON.stringify(stiffness)}`
        );
    }

    const damping = config.damping ?? 26;
    if (!Number.isFinite(damping) || damping <= 0) {
        throw new Error(
            `micugl transitions: "damping" must be a finite number > 0, received ${JSON.stringify(damping)}. An `
            + 'undamped spring never comes to rest: it would oscillate around its target forever, animating and '
            + 'keeping the render loop awake for as long as it is mounted instead of letting it go idle.'
        );
    }

    const mass = config.mass ?? 1;
    if (!Number.isFinite(mass) || mass <= 0) {
        throw new Error(
            `micugl transitions: "mass" must be a finite number > 0, received ${JSON.stringify(mass)}`
        );
    }

    const restDelta = config.restDelta ?? 0.001;
    if (!Number.isFinite(restDelta) || restDelta < 0) {
        throw new Error(
            `micugl transitions: "restDelta" must be a finite number >= 0, received ${JSON.stringify(restDelta)}`
        );
    }

    const restSpeed = config.restSpeed ?? 0.01;
    if (!Number.isFinite(restSpeed) || restSpeed < 0) {
        throw new Error(
            `micugl transitions: "restSpeed" must be a finite number >= 0, received ${JSON.stringify(restSpeed)}`
        );
    }

    const substepSeconds = springSubstepSeconds(stiffness, damping, mass);
    if (SPRING_MAX_DT_SECONDS / substepSeconds > SPRING_MAX_SUBSTEPS_PER_FRAME) {
        throw new Error(
            `micugl transitions: a spring with stiffness ${String(stiffness)}, damping ${String(damping)} and mass `
            + `${String(mass)} needs a ${substepSeconds.toExponential(2)}s integration substep to stay stable, which `
            + 'is far finer than one frame can afford. Lower "stiffness" or "damping", or raise "mass".'
        );
    }

    return { kind: 'spring', stiffness, damping, mass, restDelta, restSpeed, substepSeconds };
}

function resolveTweenConfig(config: TweenTransitionConfig): ResolvedTweenConfig {
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
        kind: 'tween',
        duration,
        delay,
        easing: resolveEasing(config.easing),
        interpolate: config.interpolate
    };
}

export function resolveTransitionConfig(config: UniformTransitionConfig): ResolvedTransitionConfig {
    if (config.type === 'spring') {
        return resolveSpringConfig(config);
    }
    return resolveTweenConfig(config);
}

export function createMotionState(config: ResolvedTransitionConfig, initial: Float32Array): MotionState {
    return {
        from: initial.slice(),
        to: initial.slice(),
        current: initial.slice(),
        velocity: new Float32Array(initial.length),
        startTime: null,
        lastTime: null,
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
    state.lastTime = null;
    state.settled = false;
    state.config = config;
    if (config.kind === 'tween') {
        state.velocity.fill(0);
    }
}

function sampleTween(state: MotionState, timeMs: number, config: ResolvedTweenConfig): boolean {
    const { duration, delay, easing, interpolate } = config;

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

function integrateSpringStep(state: MotionState, config: ResolvedSpringConfig, dtSeconds: number): void {
    const { stiffness, damping, mass } = config;
    for (let i = 0; i < state.current.length; i++) {
        const displacement = state.current[i] - state.to[i];
        const springForce = -stiffness * displacement;
        const dampingForce = -damping * state.velocity[i];
        const acceleration = (springForce + dampingForce) / mass;
        state.velocity[i] += acceleration * dtSeconds;
        state.current[i] += state.velocity[i] * dtSeconds;
    }
}

function sampleSpring(state: MotionState, timeMs: number, config: ResolvedSpringConfig): boolean {
    state.lastTime ??= timeMs;

    let dtSeconds = (timeMs - state.lastTime) / 1000;
    if (dtSeconds < 0) dtSeconds = 0;
    dtSeconds = Math.min(dtSeconds, SPRING_MAX_DT_SECONDS);
    state.lastTime = timeMs;

    let remaining = dtSeconds;
    while (remaining > 0) {
        const step = Math.min(config.substepSeconds, remaining);
        integrateSpringStep(state, config, step);
        remaining -= step;
    }

    for (let i = 0; i < state.current.length; i++) {
        const atRest =
            Math.abs(state.velocity[i]) < config.restSpeed
            && Math.abs(state.current[i] - state.to[i]) < config.restDelta;
        if (!atRest) {
            return false;
        }
    }

    state.current.set(state.to);
    state.velocity.fill(0);
    state.settled = true;

    return true;
}

export function sampleMotion(state: MotionState, timeMs: number): boolean {
    if (state.settled) {
        return true;
    }

    return state.config.kind === 'tween'
        ? sampleTween(state, timeMs, state.config)
        : sampleSpring(state, timeMs, state.config);
}
