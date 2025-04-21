import { CSSProperties } from 'react';
import { FramebufferOptions, RenderPass, ShaderProgramConfig } from '../../../core';
interface PingPongShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    className?: string;
    style?: CSSProperties;
    useDevicePixelRatio?: boolean;
}
export declare const PingPongShaderEngine: ({ programConfigs, passes, framebuffers, className, style, useDevicePixelRatio }: PingPongShaderEngineProps) => import("react/jsx-runtime").JSX.Element;
export {};
