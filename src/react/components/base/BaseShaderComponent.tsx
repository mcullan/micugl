import type { CSSProperties } from 'react';
import { memo } from 'react';

import type { RenderOptions, ShaderProgramConfig, ShaderRenderCallback } from '@/core';
import { ShaderEngine } from '@/react';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { UniformParam } from '@/types';

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

const RENDER_OPTIONS: RenderOptions = {
    clear: true,
    clearColor: [0, 0, 0, 1]
};

const renderFullscreenQuad: ShaderRenderCallback = (_time, _resources, gl) => {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

const BaseShaderComponentImpl = ({
    programId,
    shaderConfig,
    uniforms,
    skipDefaultUniforms = false,
    width,
    height,
    pixelRatio,
    className = '',
    style,
    renderOptions = RENDER_OPTIONS
}: BaseShaderProps) => {
    const programConfigs = { [programId]: shaderConfig };
    const uniformUpdaters = useUniformUpdaters(programId, uniforms, { skipDefaultUniforms });

    return (
        <ShaderEngine
            programConfigs={programConfigs}
            renderCallback={renderFullscreenQuad}
            uniformUpdaters={uniformUpdaters}
            width={width}
            height={height}
            pixelRatio={pixelRatio}
            className={className}
            style={style}
            useFastPath={true}
            renderOptions={renderOptions}
        />
    );
};

export const BaseShaderComponent = memo(BaseShaderComponentImpl);
