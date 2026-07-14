import { vec3 } from '@/core';
import { assertFinite, assertVec3 } from '@/effects/lib/validate';
import type { UniformParam, Vec3 } from '@/types';

export type DitherMatrixLevels = 1 | 2 | 3;

export interface DitherQuantizeProps {
    levels?: number;
    matrixLevels?: DitherMatrixLevels;
    scale?: number;
}

export interface DitherGradientProps {
    colorA?: Vec3;
    colorB?: Vec3;
    speed?: number;
}

export interface DitherUniformProps extends DitherQuantizeProps, DitherGradientProps {}

const DITHER_DEFAULTS = {
    levels: 3,
    matrixLevels: 3 as DitherMatrixLevels,
    scale: 1,
    colorA: [0.05, 0.05, 0.08] as Vec3,
    colorB: [0.95, 0.95, 0.98] as Vec3,
    speed: 0.3
} as const;

export const ditherQuantizeUniforms = (
    props: DitherQuantizeProps = {}
): Record<string, UniformParam> => {
    const levels = assertFinite('levels', props.levels ?? DITHER_DEFAULTS.levels);
    if (levels < 2) {
        throw new Error(
            `micugl effects: "levels" must be greater than or equal to 2, received ${String(levels)}.`
        );
    }
    const scale = assertFinite('scale', props.scale ?? DITHER_DEFAULTS.scale);
    if (scale <= 0) {
        throw new Error(
            `micugl effects: "scale" must be greater than 0, received ${String(scale)}.`
        );
    }
    const matrixLevels = props.matrixLevels ?? DITHER_DEFAULTS.matrixLevels;

    return {
        u_levels: { type: 'float', value: levels },
        u_bayerLevels: { type: 'float', value: matrixLevels },
        u_scale: { type: 'float', value: scale }
    };
};

export const ditherGradientUniforms = (
    props: DitherUniformProps = {}
): Record<string, UniformParam> => {
    const colorA = assertVec3('colorA', props.colorA ?? DITHER_DEFAULTS.colorA);
    const colorB = assertVec3('colorB', props.colorB ?? DITHER_DEFAULTS.colorB);
    const speed = assertFinite('speed', props.speed ?? DITHER_DEFAULTS.speed);

    return {
        ...ditherQuantizeUniforms(props),
        u_colorA: { type: 'vec3', value: vec3(colorA) },
        u_colorB: { type: 'vec3', value: vec3(colorB) },
        u_speed: { type: 'float', value: speed }
    };
};
