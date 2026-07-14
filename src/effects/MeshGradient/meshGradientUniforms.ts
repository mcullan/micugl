import { vec3 } from '@/core';
import { resolveAudioReaction } from '@/effects/lib/audioUniforms';
import { assertColors, assertFinite } from '@/effects/lib/validate';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam, Vec3 } from '@/types';

export interface MeshGradientUniformProps {
    colors?: Vec3[];
    speed?: number;
    warp?: number;
    warpScale?: number;
    seed?: number;
    audio?: AudioUniformsResult;
    audioStrength?: number;
}

export const MESH_GRADIENT_DEFAULT_COLORS: Vec3[] = [
    [0.96, 0.76, 0.85],
    [0.74, 0.85, 0.96],
    [0.80, 0.95, 0.82],
    [0.98, 0.92, 0.76]
];

const MESH_GRADIENT_DEFAULTS = {
    speed: 0.2,
    warp: 0.6,
    warpScale: 1.2,
    seed: 0,
    audioStrength: 1
} as const;

const colorSlot = (colors: Vec3[], index: number): UniformParam => ({
    type: 'vec3',
    value: vec3(colors[Math.min(index, colors.length - 1)])
});

export const meshGradientUniforms = (
    props: MeshGradientUniformProps = {}
): Record<string, UniformParam> => {
    const colors = assertColors('colors', props.colors ?? MESH_GRADIENT_DEFAULT_COLORS);
    const speed = assertFinite('speed', props.speed ?? MESH_GRADIENT_DEFAULTS.speed);
    const warp = assertFinite('warp', props.warp ?? MESH_GRADIENT_DEFAULTS.warp);
    const warpScale = assertFinite('warpScale', props.warpScale ?? MESH_GRADIENT_DEFAULTS.warpScale);
    const seed = assertFinite('seed', props.seed ?? MESH_GRADIENT_DEFAULTS.seed);
    const audioStrength = props.audioStrength ?? MESH_GRADIENT_DEFAULTS.audioStrength;

    const audio = resolveAudioReaction(props.audio, audioStrength);

    return {
        u_color0: colorSlot(colors, 0),
        u_color1: colorSlot(colors, 1),
        u_color2: colorSlot(colors, 2),
        u_color3: colorSlot(colors, 3),
        u_colorCount: { type: 'float', value: colors.length },
        u_speed: { type: 'float', value: speed },
        u_warp: { type: 'float', value: warp },
        u_warpScale: { type: 'float', value: warpScale },
        u_seed: { type: 'float', value: seed },
        u_audioLevel: audio.u_audioLevel,
        u_audioStrength: audio.u_audioStrength
    };
};
