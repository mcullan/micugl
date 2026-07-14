import type { ShaderNode } from '@/core';
import { shaderNode } from '@/core';
import { grainConfig } from '@/effects/Grain/grainShaders';
import type { GrainUniformProps } from '@/effects/Grain/grainUniforms';
import { grainUniforms } from '@/effects/Grain/grainUniforms';
import type { NodePlacementProps } from '@/effects/lib/nodePlacement';

export interface GrainNodeProps extends NodePlacementProps, GrainUniformProps {}

export const grainNode = (props: GrainNodeProps): ShaderNode => {
    const { id, width, height, textureOptions, renderOptions, ...uniformProps } = props;
    return shaderNode({
        id,
        shaderConfig: grainConfig,
        uniforms: grainUniforms(uniformProps),
        width,
        height,
        textureOptions,
        renderOptions
    });
};
