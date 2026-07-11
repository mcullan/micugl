import type { CSSProperties } from 'react';
import { forwardRef, memo } from 'react';

import type { RenderOptions, ShaderProgramConfig, ShaderRenderCallback } from '@/core';
import { ShaderEngine } from '@/react';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { RenderControlProps, ShaderHandle, UniformParam } from '@/types';

export interface BaseShaderProps extends RenderControlProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    skipDefaultUniforms?: boolean;
    className?: string;
    style?: CSSProperties;
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
}

const RENDER_OPTIONS: RenderOptions = {
    clear: true,
    clearColor: [0, 0, 0, 1]
};

const renderFullscreenQuad: ShaderRenderCallback = (_time, _resources, gl) => {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

const BaseShaderComponentImpl = forwardRef<ShaderHandle, BaseShaderProps>(({
    programId,
    shaderConfig,
    uniforms,
    skipDefaultUniforms = false,
    width,
    height,
    pixelRatio,
    useDevicePixelRatio,
    frameloop,
    speed,
    pauseWhenHidden,
    dpr,
    maxPixelCount,
    fit,
    className = '',
    style,
    renderOptions = RENDER_OPTIONS
}, ref) => {
    const programConfigs = { [programId]: shaderConfig };
    const uniformUpdaters = useUniformUpdaters(programId, uniforms, { skipDefaultUniforms });

    return (
        <ShaderEngine
            ref={ref}
            programConfigs={programConfigs}
            renderCallback={renderFullscreenQuad}
            uniformUpdaters={uniformUpdaters}
            width={width}
            height={height}
            pixelRatio={pixelRatio}
            useDevicePixelRatio={useDevicePixelRatio}
            frameloop={frameloop}
            speed={speed}
            pauseWhenHidden={pauseWhenHidden}
            dpr={dpr}
            maxPixelCount={maxPixelCount}
            fit={fit}
            className={className}
            style={style}
            useFastPath={true}
            renderOptions={renderOptions}
        />
    );
});

BaseShaderComponentImpl.displayName = 'BaseShaderComponent';

export const BaseShaderComponent = memo(BaseShaderComponentImpl);
