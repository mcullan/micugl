import { CSSProperties } from 'react';
import { FramebufferOptions, RenderPass, ShaderProgramConfig } from '../../../core';
import { UniformParam } from '../../../types';
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
    style?: CSSProperties;
    customPasses?: RenderPass[];
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
}
export declare const BasePingPongShaderComponent: ({ programId, shaderConfig, secondaryProgramId, secondaryShaderConfig, iterations, uniforms, secondaryUniforms, framebufferOptions, className, style, customPasses, renderOptions }: BasePingPongShaderProps) => import("react/jsx-runtime").JSX.Element;
