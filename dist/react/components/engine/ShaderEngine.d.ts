import { CSSProperties } from 'react';
import { RenderOptions, ShaderProgramConfig, ShaderRenderCallback, UniformType, UniformUpdateFn } from '../../../core';
interface ShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    renderCallback: ShaderRenderCallback;
    renderOptions?: RenderOptions;
    className?: string;
    style?: CSSProperties;
    uniformUpdaters?: Record<string, {
        name: string;
        type: UniformType;
        updateFn: UniformUpdateFn<UniformType>;
    }[]>;
    useFastPath?: boolean;
    useDevicePixelRatio?: boolean;
}
export declare const ShaderEngine: ({ programConfigs, renderCallback, renderOptions, className, style, uniformUpdaters, useFastPath, useDevicePixelRatio }: ShaderEngineProps) => import("react/jsx-runtime").JSX.Element;
export {};
