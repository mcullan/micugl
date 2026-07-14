import { assertFinite } from '@/effects/lib/validate';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam } from '@/types';

const LEVEL_NAME = 'u_audioLevel';

export interface AudioReaction {
    u_audioLevel: UniformParam;
    u_audioStrength: UniformParam;
}

export const resolveAudioReaction = (
    audio: AudioUniformsResult | undefined,
    audioStrength: number
): AudioReaction => {
    const strength = assertFinite('audioStrength', audioStrength);

    if (audio === undefined) {
        return {
            u_audioLevel: { type: 'float', value: 0 },
            u_audioStrength: { type: 'float', value: 0 }
        };
    }

    if (!Object.prototype.hasOwnProperty.call(audio.uniforms, LEVEL_NAME)) {
        throw new Error(
            'micugl effects: the "audio" prop carries no "u_audioLevel" uniform. An effect reads the audio LEVEL '
            + 'by its default name, so useAudioUniforms must keep the default uniform names. Drop the custom '
            + '"names.level" option, or drive the audio uniforms yourself through BaseShaderComponent.'
        );
    }

    return {
        u_audioLevel: audio.uniforms[LEVEL_NAME],
        u_audioStrength: { type: 'float', value: strength }
    };
};
