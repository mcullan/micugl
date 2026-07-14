import type { ShaderNode } from '@/core';
import { shaderNode } from '@/core';
import type { NodePlacementProps } from '@/effects/lib/nodePlacement';
import { meshGradientConfig } from '@/effects/MeshGradient/meshGradientShaders';
import type { MeshGradientUniformProps } from '@/effects/MeshGradient/meshGradientUniforms';
import { meshGradientUniforms } from '@/effects/MeshGradient/meshGradientUniforms';

export interface MeshGradientNodeProps extends NodePlacementProps, MeshGradientUniformProps {}

export const meshGradientNode = (props: MeshGradientNodeProps): ShaderNode => {
    const { id, width, height, textureOptions, renderOptions, ...uniformProps } = props;
    return shaderNode({
        id,
        shaderConfig: meshGradientConfig,
        uniforms: meshGradientUniforms(uniformProps),
        width,
        height,
        textureOptions,
        renderOptions
    });
};
