import type { ShaderNode } from '@/core';
import { shaderNode } from '@/core';
import { blurConfig } from '@/effects/Blur/blurShaders';
import type { BlurUniformProps } from '@/effects/Blur/blurUniforms';
import { blurUniforms } from '@/effects/Blur/blurUniforms';
import type { NodePlacementProps } from '@/effects/lib/nodePlacement';
import type { TextureSource } from '@/types';

export interface BlurNodeProps extends NodePlacementProps, BlurUniformProps {
    src: ShaderNode | TextureSource;
}

export const blurNode = (props: BlurNodeProps): ShaderNode => {
    const { id, src, radius, width, height, textureOptions, renderOptions } = props;

    const xNode = shaderNode({
        id: `${id}-x`,
        shaderConfig: blurConfig,
        uniforms: { u_src: src, ...blurUniforms([1, 0], { radius }) },
        width,
        height,
        textureOptions,
        renderOptions
    });

    return shaderNode({
        id,
        shaderConfig: blurConfig,
        uniforms: { u_src: xNode, ...blurUniforms([0, 1], { radius }) },
        width,
        height,
        textureOptions,
        renderOptions
    });
};
