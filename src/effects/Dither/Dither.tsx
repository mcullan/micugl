import { forwardRef } from 'react';

import { ditherGradientConfig } from '@/effects/Dither/ditherShaders';
import type { DitherUniformProps } from '@/effects/Dither/ditherUniforms';
import { ditherGradientUniforms } from '@/effects/Dither/ditherUniforms';
import type { EffectRenderProps } from '@/effects/lib/effectProps';
import { BaseShaderComponent } from '@/react';
import type { ShaderHandle } from '@/types';

export interface DitherProps extends EffectRenderProps, DitherUniformProps {}

const PROGRAM_ID = 'micugl-effect-dither';

const config = ditherGradientConfig;

export const Dither = forwardRef<ShaderHandle, DitherProps>((props, ref) => {
    const { levels, matrixLevels, scale, colorA, colorB, speed, ...renderProps } = props;

    const uniforms = ditherGradientUniforms({ levels, matrixLevels, scale, colorA, colorB, speed });

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

Dither.displayName = 'Dither';
