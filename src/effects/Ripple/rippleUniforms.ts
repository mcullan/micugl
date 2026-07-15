import { vec2, vec3 } from '@/core';
import { resolveAudioReaction } from '@/effects/lib/audioUniforms';
import { assertFinite, assertVec3 } from '@/effects/lib/validate';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam, Vec2, Vec3 } from '@/types';

export interface RippleUniformProps {
    damping?: number;
    mouseForce?: number;
    autoDrip?: boolean;
    audio?: AudioUniformsResult;
    audioStrength?: number;
}

export interface RipplePointer {
    position: () => Vec2;
    force: () => number;
}

export interface RippleRenderUniformProps {
    color1?: Vec3;
    color2?: Vec3;
}

const RIPPLE_DEFAULTS = {
    damping: 0.99,
    mouseForce: 0.5,
    audioStrength: 1
} as const;

const RIPPLE_RENDER_DEFAULTS = {
    color1: [0.1, 0.3, 0.1] as Vec3,
    color2: [0.3, 0.2, 0.4] as Vec3
} as const;

export const rippleSimUniforms = (
    props: RippleUniformProps,
    pointer: RipplePointer
): Record<string, UniformParam> => {
    const damping = assertFinite('damping', props.damping ?? RIPPLE_DEFAULTS.damping);
    if (damping <= 0 || damping >= 1) {
        throw new Error(
            `micugl effects: "damping" must be greater than 0 and less than 1, received ${String(damping)}. `
            + 'Outside that range the ripple height field never decays or never settles, so it would silently run '
            + 'away or stay permanently hot.'
        );
    }
    assertFinite('mouseForce', props.mouseForce ?? RIPPLE_DEFAULTS.mouseForce);
    const audioStrength = props.audioStrength ?? RIPPLE_DEFAULTS.audioStrength;
    const audio = resolveAudioReaction(props.audio, audioStrength);

    return {
        u_mouse: { type: 'vec2', value: () => vec2(pointer.position()) },
        u_mouseForce: { type: 'float', value: () => pointer.force() },
        u_damping: { type: 'float', value: damping },
        u_autoDrip: { type: 'float', value: props.autoDrip ? 1 : 0 },
        u_audioLevel: audio.u_audioLevel,
        u_audioStrength: audio.u_audioStrength
    };
};

export const rippleRenderUniforms = (
    props: RippleRenderUniformProps = {}
): Record<string, UniformParam> => {
    const color1 = assertVec3('color1', props.color1 ?? RIPPLE_RENDER_DEFAULTS.color1);
    const color2 = assertVec3('color2', props.color2 ?? RIPPLE_RENDER_DEFAULTS.color2);

    return {
        u_color1: { type: 'vec3', value: vec3(color1) },
        u_color2: { type: 'vec3', value: vec3(color2) }
    };
};
