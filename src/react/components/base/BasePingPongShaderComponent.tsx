import type { CSSProperties } from 'react';
import { forwardRef, memo } from 'react';

import type { FramebufferOptions, RenderOptions, RenderPass, ShaderProgramConfig } from '@/core';
import { PingPongShaderEngine } from '@/react/components/engine/PingPongShaderEngine';
import { usePingPongPasses } from '@/react/hooks/usePingPongPasses';
import type { RenderControlProps, ShaderHandle, UniformParam } from '@/types';

export interface BasePingPongShaderProps extends RenderControlProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    secondaryProgramId?: string;
    secondaryShaderConfig?: ShaderProgramConfig;
    iterations?: number;
    uniforms: Record<string, UniformParam>;
    secondaryUniforms?: Record<string, UniformParam>;
    framebufferOptions?: FramebufferOptions;
    framebuffers?: Record<string, FramebufferOptions>;
    className?: string;
    style?: CSSProperties;
    renderWidth?: number;
    renderHeight?: number;
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

const BasePingPongShaderComponentImpl = forwardRef<ShaderHandle, BasePingPongShaderProps>(({
    programId,
    shaderConfig,
    secondaryProgramId,
    secondaryShaderConfig,
    iterations = 1,
    uniforms,
    secondaryUniforms,
    framebufferOptions,
    framebuffers: framebuffersOverride,
    className = '',
    style,
    width,
    height,
    renderWidth,
    renderHeight,
    pixelRatio,
    useDevicePixelRatio,
    frameloop,
    speed,
    pauseWhenHidden,
    dpr,
    maxPixelCount,
    fit,
    customPasses,
    renderOptions = RENDER_OPTIONS
}, ref) => {
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
        customPasses,
        framebuffers: framebuffersOverride
    });

    return (
        <PingPongShaderEngine
            ref={ref}
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            className={className}
            style={style}
            width={width}
            height={height}
            renderWidth={renderWidth}
            renderHeight={renderHeight}
            pixelRatio={pixelRatio}
            useDevicePixelRatio={useDevicePixelRatio}
            frameloop={frameloop}
            speed={speed}
            pauseWhenHidden={pauseWhenHidden}
            dpr={dpr}
            maxPixelCount={maxPixelCount}
            fit={fit}
        />
    );
});

BasePingPongShaderComponentImpl.displayName = 'BasePingPongShaderComponent';

export const BasePingPongShaderComponent = memo(BasePingPongShaderComponentImpl);
