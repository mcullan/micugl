import { forwardRef } from 'react';

import { createShaderConfig } from '@/core';
import { grainFragmentShader } from '@/effects/Grain/grainShaders';
import type { GrainUniformProps } from '@/effects/Grain/grainUniforms';
import { grainUniforms } from '@/effects/Grain/grainUniforms';
import type { EffectRenderProps } from '@/effects/lib/effectProps';
import { fullscreenVertexShader } from '@/effects/lib/fullscreenVertexShader';
import { BaseShaderComponent } from '@/react';
import type { ShaderHandle } from '@/types';

export interface GrainProps extends EffectRenderProps, GrainUniformProps {}

const PROGRAM_ID = 'micugl-effect-grain';

const config = createShaderConfig({
    vertexShader: fullscreenVertexShader,
    fragmentShader: grainFragmentShader,
    uniformNames: {
        u_color: 'vec3',
        u_grainColor: 'vec3',
        u_intensity: 'float',
        u_scale: 'float',
        u_speed: 'float',
        u_audioLevel: 'float',
        u_audioStrength: 'float'
    }
});

export const Grain = forwardRef<ShaderHandle, GrainProps>((props, ref) => {
    const { color, grainColor, intensity, scale, speed, audio, audioStrength, ...renderProps } = props;

    const uniforms = grainUniforms({ color, grainColor, intensity, scale, speed, audio, audioStrength });

    return (
        <BaseShaderComponent
            ref={ref}
            programId={PROGRAM_ID}
            shaderConfig={config}
            uniforms={uniforms}
            {...renderProps}
        />
    );
});

Grain.displayName = 'Grain';
