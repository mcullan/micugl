import { forwardRef } from 'react';

import { createShaderConfig } from '@/core';
import type { EffectRenderProps } from '@/effects/lib/effectProps';
import { fullscreenVertexShader } from '@/effects/lib/fullscreenVertexShader';
import { meshGradientFragmentShader } from '@/effects/MeshGradient/meshGradientShaders';
import type { MeshGradientUniformProps } from '@/effects/MeshGradient/meshGradientUniforms';
import { meshGradientUniforms } from '@/effects/MeshGradient/meshGradientUniforms';
import { BaseShaderComponent } from '@/react';
import type { ShaderHandle } from '@/types';

export interface MeshGradientProps extends EffectRenderProps, MeshGradientUniformProps {}

const PROGRAM_ID = 'micugl-effect-mesh-gradient';

const config = createShaderConfig({
    vertexShader: fullscreenVertexShader,
    fragmentShader: meshGradientFragmentShader,
    uniformNames: {
        u_color0: 'vec3',
        u_color1: 'vec3',
        u_color2: 'vec3',
        u_color3: 'vec3',
        u_colorCount: 'float',
        u_speed: 'float',
        u_warp: 'float',
        u_warpScale: 'float',
        u_seed: 'float',
        u_audioLevel: 'float',
        u_audioStrength: 'float'
    }
});

export const MeshGradient = forwardRef<ShaderHandle, MeshGradientProps>((props, ref) => {
    const {
        colors,
        speed,
        warp,
        warpScale,
        seed,
        audio,
        audioStrength,
        ...renderProps
    } = props;

    const uniforms = meshGradientUniforms({ colors, speed, warp, warpScale, seed, audio, audioStrength });

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

MeshGradient.displayName = 'MeshGradient';
