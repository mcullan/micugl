import { CSSProperties } from 'react';
import { FramebufferOptions, RenderPass, ShaderProgramConfig } from '../../../core';
interface PingPongShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    className?: string;
    style?: CSSProperties;
    width?: number;
    height?: number;
    renderWidth?: number;
    renderHeight?: number;
    useDevicePixelRatio?: boolean;
    pixelRatio?: number;
}
export declare const PingPongShaderEngine: ({ programConfigs, passes, framebuffers, className, style, width, height, renderWidth, renderHeight, useDevicePixelRatio, pixelRatio }: PingPongShaderEngineProps) => import("react/jsx-runtime").JSX.Element;
export {};
