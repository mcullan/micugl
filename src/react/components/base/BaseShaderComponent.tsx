import React from 'react';

import type { RenderOptions, ShaderProgramConfig, ShaderRenderCallback } from '_shaders/core';
import { ShaderEngine } from '_shaders/react';
import {useUniformUpdaters } from '_shaders/react/hooks/useUniformUpdaters';
import type { UniformParam} from '_shaders/types';

export interface BaseShaderProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    className?: string;
    style?: React.CSSProperties;
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
}

const RENDER_OPTIONS: RenderOptions = {
    clear: true,
    clearColor: [0, 0, 0, 1]
};

export const BaseShaderComponent: React.FC<BaseShaderProps> = ({
    programId,
    shaderConfig,
    uniforms,
    className = '',
    style,
    renderOptions = RENDER_OPTIONS
}) => {
    const programConfigs = { [programId]: shaderConfig };
    const uniformUpdaters = useUniformUpdaters(programId, uniforms);

    const renderCallback: ShaderRenderCallback = (_time, _resources, gl) => {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    return (
        <ShaderEngine
            programConfigs={programConfigs}
            renderCallback={renderCallback}
            uniformUpdaters={uniformUpdaters}
            className={className}
            style={style}
            useFastPath={true}
            renderOptions={renderOptions}
        />
    );
};
