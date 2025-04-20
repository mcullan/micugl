import React from 'react';

import type { FramebufferOptions, RenderOptions, RenderPass,ShaderProgramConfig } from '_shaders/core';
import { PingPongShaderEngine } from '_shaders/react/components/engine/PingPongShaderEngine';
import { usePingPongPasses } from '_shaders/react/hooks/usePingPongPasses';
import type { UniformParam } from '_shaders/types';

export interface BasePingPongShaderProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    secondaryProgramId?: string;
    secondaryShaderConfig?: ShaderProgramConfig;
    iterations?: number;
    uniforms: Record<string, UniformParam>;
    secondaryUniforms?: Record<string, UniformParam>;
    framebufferOptions?: FramebufferOptions;
    className?: string;
    style?: React.CSSProperties;
    customPasses?: RenderPass[];
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
}

const RENDER_OPTIONS: RenderOptions = {
    clear: true,
    clearColor: [0, 0, 0, 1]
};
export const BasePingPongShaderComponent: React.FC<BasePingPongShaderProps> = ({
    programId,
    shaderConfig,
    secondaryProgramId,
    secondaryShaderConfig,
    iterations = 1,
    uniforms,
    secondaryUniforms,
    framebufferOptions,
    className = '',
    style,
    customPasses,
    renderOptions = RENDER_OPTIONS
}) => {
    const actualSecondaryProgramId = secondaryProgramId ?? `${programId}-secondary`;
    const programConfigs: Record<string, ShaderProgramConfig> = {
        [programId]: shaderConfig
    };
    
    if (secondaryShaderConfig) {
        programConfigs[actualSecondaryProgramId] = secondaryShaderConfig;
    }
    
    const { passes, framebuffers } = usePingPongPasses({
        programId,
        secondaryProgramId: secondaryShaderConfig ? actualSecondaryProgramId : undefined,
        iterations,
        uniforms,
        secondaryUniforms,
        framebufferOptions,
        renderOptions,
        customPasses
    });

    return (
        <PingPongShaderEngine
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            className={className}
            style={style}
        />
    );
};
