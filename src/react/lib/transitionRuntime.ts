import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import {
    createMotionState,
    type MotionState,
    resolveTransitionConfig,
    retargetMotion,
    sampleMotion
} from '@/core/lib/motionDrivers';
import { UNIFORM_COMPONENTS } from '@/core/lib/uniformComponents';
import type { SpringsInFlight } from '@/react/lib/captureLiveness';
import { normalizeUniformName } from '@/react/lib/liveUniformUpdaters';
import type { MotionGate } from '@/react/lib/motionPolicy';
import type { UniformParam, UniformType, UniformValue } from '@/types';

export interface TransitionRuntime {
    applyTargets(uniforms: Record<string, UniformParam>, motionGate: MotionGate): void;
    sample(name: string, timeMs: number): Float32Array | number | null;
    springsInFlight: SpringsInFlight;
    invalidation: FrameInvalidation;
}

const TRANSITIONABLE: ReadonlySet<UniformType> = new Set<UniformType>(['float', 'vec2', 'vec3', 'vec4']);

function componentsForType(type: UniformType, name: string): number {
    if (!TRANSITIONABLE.has(type)) {
        throw new Error(
            `micugl transitions: uniform "${name}" has type "${type}", but "transition" is only supported for `
            + 'float/vec2/vec3/vec4 uniforms. Remove the transition, or drop this uniform to a supported type.'
        );
    }
    return UNIFORM_COMPONENTS[type];
}

function targetFromValue(
    type: UniformType,
    value: UniformValue<UniformType>,
    name: string
): Float32Array {
    if (typeof value === 'function') {
        throw new Error(
            `micugl transitions: uniform "${name}" has a "transition", but its value is a function. A `
            + 'function-valued uniform already produces a new value every frame, so a transition config has no '
            + `target to animate toward. Remove "transition" from "${name}", or make its value a plain number/array.`
        );
    }

    const components = componentsForType(type, name);
    const target = new Float32Array(components);

    if (typeof value === 'number') {
        if (components !== 1) {
            throw new Error(
                `micugl transitions: uniform "${name}" is a "${type}" and expects ${String(components)} `
                + 'components, received a single number'
            );
        }
        target[0] = value;
    } else {
        if (value.length !== components) {
            throw new Error(
                `micugl transitions: uniform "${name}" is a "${type}" and expects ${String(components)} `
                + `components, received ${String(value.length)}`
            );
        }
        target.set(value);
    }

    for (let i = 0; i < target.length; i++) {
        if (!Number.isFinite(target[i])) {
            throw new Error(
                `micugl transitions: uniform "${name}" transition target has a non-finite value at index ${i}`
            );
        }
    }

    return target;
}

function targetsEqual(a: Float32Array, b: Float32Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function snapToTarget(state: MotionState, target: Float32Array): void {
    state.from.set(target);
    state.to.set(target);
    state.current.set(target);
    state.velocity.fill(0);
    state.settled = true;
}

export function createTransitionRuntime(isOverridden: (name: string) => boolean): TransitionRuntime {
    const states = new Map<string, MotionState>();
    const invalidation = createFrameInvalidation();

    return {
        applyTargets(uniforms, motionGate) {
            const declared = new Set<string>();

            for (const [rawName, param] of Object.entries(uniforms)) {
                if (!param.transition) {
                    continue;
                }

                const name = normalizeUniformName(rawName);
                declared.add(name);

                const target = targetFromValue(param.type, param.value, name);
                const config = resolveTransitionConfig(param.transition);

                const state = states.get(name);
                if (!state || state.to.length !== target.length) {
                    states.set(name, createMotionState(config, target));
                    continue;
                }

                if (motionGate !== 'none') {
                    state.config = config;
                    if (!state.settled || !targetsEqual(state.to, target)) {
                        snapToTarget(state, target);
                        invalidation.request();
                    }
                    continue;
                }

                if (!targetsEqual(state.to, target)) {
                    retargetMotion(state, target, config);
                    invalidation.request();
                }
            }

            for (const name of Array.from(states.keys())) {
                if (!declared.has(name)) {
                    states.delete(name);
                }
            }
        },
        sample(name, timeMs) {
            const state = states.get(name);
            if (!state || state.settled || isOverridden(name)) {
                return null;
            }

            const settledNow = sampleMotion(state, timeMs);
            if (!settledNow) {
                invalidation.request();
            }

            return state.current.length === 1 ? state.current[0] : state.current;
        },
        springsInFlight: () => {
            for (const [name, state] of states) {
                if (state.config.kind === 'spring' && !state.settled && !isOverridden(name)) {
                    return true;
                }
            }
            return false;
        },
        invalidation
    };
}
