import { CSSProperties } from 'react';
import { RenderOptions, ShaderProgramConfig, ShaderRenderCallback, UniformType, UniformUpdateFn } from '../../../core';
interface ShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    renderCallback: ShaderRenderCallback;
    renderOptions?: RenderOptions;
    className?: string;
    style?: CSSProperties;
    width?: number;
    height?: number;
    uniformUpdaters?: Record<string, {
        name: string;
        type: UniformType;
        updateFn: UniformUpdateFn<UniformType>;
    }[]>;
    useFastPath?: boolean;
    useDevicePixelRatio?: boolean;
    pixelRatio?: number;
}
export declare const ShaderEngine: ({ programConfigs, renderCallback, renderOptions, className, style, width, height, uniformUpdaters, useFastPath, useDevicePixelRatio, pixelRatio }: ShaderEngineProps) => import("react/jsx-runtime").JSX.Element;
export {};
