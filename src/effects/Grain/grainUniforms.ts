import { vec3 } from '@/core';
import { resolveAudioReaction } from '@/effects/lib/audioUniforms';
import { assertFinite, assertVec3 } from '@/effects/lib/validate';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam, Vec3 } from '@/types';

export interface GrainUniformProps {
    color?: Vec3;
    grainColor?: Vec3;
    intensity?: number;
    scale?: number;
    speed?: number;
    audio?: AudioUniformsResult;
    audioStrength?: number;
}

const GRAIN_DEFAULTS = {
    color: [0, 0, 0] as Vec3,
    grainColor: [1, 1, 1] as Vec3,
    intensity: 0.08,
    scale: 2,
    speed: 1,
    audioStrength: 1
} as const;

export const grainUniforms = (
    props: GrainUniformProps = {}
): Record<string, UniformParam> => {
    const color = assertVec3('color', props.color ?? GRAIN_DEFAULTS.color);
    const grainColor = assertVec3('grainColor', props.grainColor ?? GRAIN_DEFAULTS.grainColor);
    const intensity = assertFinite('intensity', props.intensity ?? GRAIN_DEFAULTS.intensity);
    const scale = assertFinite('scale', props.scale ?? GRAIN_DEFAULTS.scale);
    if (scale <= 0) {
        throw new Error(
            `micugl effects: "scale" must be greater than 0, received ${String(scale)}.`
        );
    }
    const speed = assertFinite('speed', props.speed ?? GRAIN_DEFAULTS.speed);
    const audioStrength = props.audioStrength ?? GRAIN_DEFAULTS.audioStrength;

    const audio = resolveAudioReaction(props.audio, audioStrength);

    return {
        u_color: { type: 'vec3', value: vec3(color) },
        u_grainColor: { type: 'vec3', value: vec3(grainColor) },
        u_intensity: { type: 'float', value: intensity },
        u_scale: { type: 'float', value: scale },
        u_speed: { type: 'float', value: speed },
        u_audioLevel: audio.u_audioLevel,
        u_audioStrength: audio.u_audioStrength
    };
};
