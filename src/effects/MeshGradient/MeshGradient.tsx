import { forwardRef } from 'react';

import type { EffectRenderProps } from '@/effects/lib/effectProps';
import { meshGradientConfig } from '@/effects/MeshGradient/meshGradientShaders';
import type { MeshGradientUniformProps } from '@/effects/MeshGradient/meshGradientUniforms';
import { meshGradientUniforms } from '@/effects/MeshGradient/meshGradientUniforms';
import { BaseShaderComponent } from '@/react';
import type { ShaderHandle } from '@/types';

export interface MeshGradientProps extends EffectRenderProps, MeshGradientUniformProps {}

const PROGRAM_ID = 'micugl-effect-mesh-gradient';

const config = meshGradientConfig;

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
