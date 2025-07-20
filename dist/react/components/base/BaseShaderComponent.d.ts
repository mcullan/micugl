import { CSSProperties } from 'react';
import { ShaderProgramConfig } from '../../../core';
import { UniformParam } from '../../../types';
export interface BaseShaderProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    skipDefaultUniforms?: boolean;
    width?: number;
    height?: number;
    pixelRatio?: number;
    className?: string;
    style?: CSSProperties;
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
}
export declare const BaseShaderComponent: ({ programId, shaderConfig, uniforms, skipDefaultUniforms, width, height, pixelRatio, className, style, renderOptions }: BaseShaderProps) => import("react/jsx-runtime").JSX.Element;
