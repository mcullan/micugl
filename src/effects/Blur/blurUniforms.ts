import { vec2 } from '@/core';
import { assertFinite } from '@/effects/lib/validate';
import type { UniformParam, Vec2 } from '@/types';

export interface BlurUniformProps {
    radius?: number;
}

const BLUR_DEFAULTS = {
    radius: 8
} as const;

export const blurUniforms = (
    direction: Vec2,
    props: BlurUniformProps = {}
): Record<string, UniformParam> => {
    const radius = assertFinite('radius', props.radius ?? BLUR_DEFAULTS.radius);
    if (radius < 0) {
        throw new Error(
            `micugl effects: "radius" must be greater than or equal to 0, received ${String(radius)}.`
        );
    }

    return {
        u_direction: { type: 'vec2', value: vec2(direction) },
        u_radius: { type: 'float', value: radius }
    };
};
