import type { ShaderNode } from '@/core';
import { shaderNode } from '@/core';
import { ditherGradientConfig, ditherSourceConfig } from '@/effects/Dither/ditherShaders';
import type {
    DitherGradientProps,
    DitherQuantizeProps,
    DitherUniformProps
} from '@/effects/Dither/ditherUniforms';
import { ditherGradientUniforms, ditherQuantizeUniforms } from '@/effects/Dither/ditherUniforms';
import type { NodePlacementProps } from '@/effects/lib/nodePlacement';
import type { TextureSource } from '@/types';

export type DitherNodeProps =
    | (NodePlacementProps & DitherQuantizeProps & { src: ShaderNode | TextureSource })
    | (NodePlacementProps & DitherUniformProps & { src?: undefined });

const GRADIENT_ONLY_KEYS: readonly (keyof DitherGradientProps)[] = ['colorA', 'colorB', 'speed'];

export const ditherNode = (props: DitherNodeProps): ShaderNode => {
    const { id, width, height, textureOptions, renderOptions } = props;

    if (props.src !== undefined) {
        for (const key of GRADIENT_ONLY_KEYS) {
            if ((props as DitherUniformProps)[key] !== undefined) {
                throw new Error(
                    `micugl effects: ditherNode "${key}" is a gradient-variant prop and applies only when no "src" input is given.`
                );
            }
        }
        const { src, levels, matrixLevels, scale } = props;
        return shaderNode({
            id,
            shaderConfig: ditherSourceConfig,
            uniforms: { u_src: src, ...ditherQuantizeUniforms({ levels, matrixLevels, scale }) },
            width,
            height,
            textureOptions,
            renderOptions
        });
    }

    const { levels, matrixLevels, scale, colorA, colorB, speed } = props;
    return shaderNode({
        id,
        shaderConfig: ditherGradientConfig,
        uniforms: ditherGradientUniforms({ levels, matrixLevels, scale, colorA, colorB, speed }),
        width,
        height,
        textureOptions,
        renderOptions
    });
};
