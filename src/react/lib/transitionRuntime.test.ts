import { describe, expect, it } from 'vitest';

import { vec3 } from '@/core/lib/vectorUtils';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import type { UniformParam, UniformTransitionConfig, Vec3 } from '@/types';

const TWEEN: UniformTransitionConfig = { duration: 100, easing: 'linear' };
const SPRING: UniformTransitionConfig = { type: 'spring', stiffness: 170, damping: 10 };

function noOverrides(): boolean {
    return false;
}

function swirl(value: number): Record<string, UniformParam> {
    return { u_swirl: { type: 'float', value, transition: TWEEN } };
}

function springSwirl(value: number): Record<string, UniformParam> {
    return { u_swirl: { type: 'float', value, transition: SPRING } };
}

function color(value: Vec3): Record<string, UniformParam> {
    return { u_color: { type: 'vec3', value: vec3(value), transition: TWEEN } };
}

describe('createTransitionRuntime', () => {
    it('first sight of a name snaps to the value and stays settled (no animation on mount)', () => {
        const runtime = createTransitionRuntime(noOverrides);
        const requests: number[] = [];
        runtime.invalidation.connect(() => { requests.push(1) });

        runtime.applyTargets(swirl(5), 'none');

        expect(requests).toHaveLength(0);
        expect(runtime.sample('u_swirl', 0)).toBeNull();
    });

    it('a changed target on a later commit retargets and requests a frame', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'none');

        const requests: number[] = [];
        runtime.invalidation.connect(() => { requests.push(1) });

        runtime.applyTargets(swirl(10), 'none');

        expect(requests).toHaveLength(1);
        expect(runtime.sample('u_swirl', 0)).toBe(0);
        expect(runtime.sample('u_swirl', 50)).toBe(5);
    });

    it('an equal-by-value target (fresh Float32Array identity) does not retarget', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(color([1, 2, 3]), 'none');

        const requests: number[] = [];
        runtime.invalidation.connect(() => { requests.push(1) });

        runtime.applyTargets(color([1, 2, 3]), 'none');

        expect(requests).toHaveLength(0);
        expect(runtime.sample('u_color', 0)).toBeNull();
    });

    it('sample returns null once settled, so the caller falls through to the plain ref read', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'none');
        runtime.applyTargets(swirl(10), 'none');

        runtime.sample('u_swirl', 0);
        expect(runtime.sample('u_swirl', 100)).toBe(10);
        expect(runtime.sample('u_swirl', 200)).toBeNull();
    });

    it('an unsettled sample keeps requesting frames until it settles', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'none');
        runtime.applyTargets(swirl(10), 'none');

        const requests: number[] = [];
        runtime.invalidation.connect(() => { requests.push(1) });

        runtime.sample('u_swirl', 0);
        expect(requests).toHaveLength(1);

        runtime.sample('u_swirl', 50);
        expect(requests).toHaveLength(2);

        runtime.sample('u_swirl', 100);
        expect(requests).toHaveLength(2);
        expect(runtime.sample('u_swirl', 150)).toBeNull();
    });

    it('a changed target under a motion gate snaps and requests exactly one frame, then goes idle', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'static');

        const requests: number[] = [];
        runtime.invalidation.connect(() => { requests.push(1) });

        runtime.applyTargets(swirl(10), 'static');

        expect(requests).toHaveLength(1);
        expect(runtime.sample('u_swirl', 0)).toBeNull();
        expect(runtime.sample('u_swirl', 50)).toBeNull();
        expect(requests).toHaveLength(1);

        runtime.applyTargets(swirl(10), 'static');
        expect(requests).toHaveLength(1);
    });

    it('a gate that turns on mid-flight settles the in-flight transition on its target', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'none');
        runtime.applyTargets(swirl(10), 'none');
        runtime.sample('u_swirl', 0);

        runtime.applyTargets(swirl(10), 'static');

        expect(runtime.sample('u_swirl', 50)).toBeNull();
    });

    it('a gate that snaps an in-flight spring clears its velocity, so lifting the gate later does not carry a phantom speed', () => {
        const gated = createTransitionRuntime(noOverrides);
        gated.applyTargets(springSwirl(0), 'none');
        gated.applyTargets(springSwirl(10), 'none');
        gated.sample('u_swirl', 0);
        gated.sample('u_swirl', 100);
        gated.applyTargets(springSwirl(10), 'static');
        expect(gated.sample('u_swirl', 200)).toBeNull();

        const fromRest = createTransitionRuntime(noOverrides);
        fromRest.applyTargets(springSwirl(10), 'none');

        gated.applyTargets(springSwirl(20), 'none');
        fromRest.applyTargets(springSwirl(20), 'none');

        for (const time of [300, 316, 332]) {
            expect(gated.sample('u_swirl', time)).toBe(fromRest.sample('u_swirl', time));
        }
    });

    it('a commit that lifts the gate and changes the value together animates, it does not snap', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'static');

        runtime.applyTargets(swirl(10), 'none');

        expect(runtime.sample('u_swirl', 0)).toBe(0);
        expect(runtime.sample('u_swirl', 50)).toBe(5);
    });

    it('an overridden name samples null even mid-flight, so devtools wins over the transition', () => {
        let overridden = false;
        const runtime = createTransitionRuntime(name => overridden && name === 'u_swirl');
        runtime.applyTargets(swirl(0), 'none');
        runtime.applyTargets(swirl(10), 'none');

        overridden = true;
        expect(runtime.sample('u_swirl', 50)).toBeNull();
    });

    it('a uniform that changes type in place restarts as a fresh state instead of sampling a stale shape', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(
            { u_bands: { type: 'float', value: 0, transition: TWEEN } },
            'none'
        );

        runtime.applyTargets(
            { u_bands: { type: 'vec3', value: vec3([0, 0, 0]), transition: TWEEN } },
            'none'
        );
        expect(runtime.sample('u_bands', 0)).toBeNull();

        runtime.applyTargets(
            { u_bands: { type: 'vec3', value: vec3([1, 2, 3]), transition: TWEEN } },
            'none'
        );

        runtime.sample('u_bands', 0);
        const midFlight = runtime.sample('u_bands', 50);

        expect(midFlight).toBeInstanceOf(Float32Array);
        expect(Array.from(midFlight as Float32Array)).toEqual([0.5, 1, 1.5]);

        const landed = runtime.sample('u_bands', 100) as Float32Array;
        expect(Array.from(landed)).toEqual([1, 2, 3]);
    });

    it('a uniform that narrows type in place (vec3 -> float) restarts as a fresh state', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(color([1, 2, 3]), 'none');

        runtime.applyTargets(
            { u_color: { type: 'float', value: 0, transition: TWEEN } },
            'none'
        );
        expect(runtime.sample('u_color', 0)).toBeNull();

        runtime.applyTargets(
            { u_color: { type: 'float', value: 10, transition: TWEEN } },
            'none'
        );
        runtime.sample('u_color', 0);
        expect(runtime.sample('u_color', 50)).toBe(5);
    });

    it('throws for a transition on an unsupported uniform type', () => {
        const runtime = createTransitionRuntime(noOverrides);
        expect(() => {
            runtime.applyTargets(
                { u_tex: { type: 'sampler2D', value: 0, transition: TWEEN } },
                'none'
            );
        }).toThrow(/float\/vec2\/vec3\/vec4/);
    });

    it('throws for a transition on a function-valued uniform', () => {
        const runtime = createTransitionRuntime(noOverrides);
        expect(() => {
            runtime.applyTargets(
                { u_wave: { type: 'float', value: () => 0, transition: TWEEN } },
                'none'
            );
        }).toThrow(/function/);
    });

    it('throws for a float whose value has more than one component', () => {
        const runtime = createTransitionRuntime(noOverrides);
        expect(() => {
            runtime.applyTargets(
                { u_swirl: { type: 'float', value: vec3([1, 2, 3]), transition: TWEEN } },
                'none'
            );
        }).toThrow(/expects 1 components, received 3/);
    });

    it('throws for a non-finite transition target', () => {
        const runtime = createTransitionRuntime(noOverrides);
        expect(() => {
            runtime.applyTargets(swirl(Number.NaN), 'none');
        }).toThrow(/non-finite/);
    });

    it('normalizes a bare uniform name, so the sampled name matches the registered updater', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets({ swirl: { type: 'float', value: 0, transition: TWEEN } }, 'none');
        runtime.applyTargets({ swirl: { type: 'float', value: 10, transition: TWEEN } }, 'none');

        runtime.sample('u_swirl', 0);
        expect(runtime.sample('u_swirl', 50)).toBe(5);
    });

    it('prunes state for a name whose transition config disappeared', () => {
        const runtime = createTransitionRuntime(noOverrides);
        runtime.applyTargets(swirl(0), 'none');
        runtime.applyTargets(swirl(10), 'none');
        runtime.sample('u_swirl', 0);

        runtime.applyTargets({ u_swirl: { type: 'float', value: 10 } }, 'none');
        expect(runtime.sample('u_swirl', 50)).toBeNull();

        runtime.applyTargets(swirl(99), 'none');
        expect(runtime.sample('u_swirl', 50)).toBeNull();
    });
});
