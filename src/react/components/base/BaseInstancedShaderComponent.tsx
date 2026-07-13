import type { CSSProperties } from 'react';
import { forwardRef, memo, useMemo, useRef } from 'react';

import type { RenderOptions, ShaderProgramConfig, ShaderRenderCallback } from '@/core';
import { combineFrameInvalidation } from '@/core';
import { ShaderEngine } from '@/react';
import { useTextureBindings } from '@/react/hooks/useTextureBindings';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type {
    InstanceAttribute,
    InstancingConfig,
    RenderControlProps,
    ShaderHandle,
    TextureSource,
    UniformParam
} from '@/types';

export interface BaseInstancedShaderProps extends Omit<RenderControlProps, 'worker' | 'createWorker'> {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    textures?: Record<string, TextureSource>;
    instanceCount: number | (() => number);
    instanceAttributes: Record<string, InstanceAttribute>;
    skipDefaultUniforms?: boolean;
    debug?: boolean;
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

const BaseInstancedShaderComponentImpl = forwardRef<ShaderHandle, BaseInstancedShaderProps>(({
    programId,
    shaderConfig,
    uniforms,
    textures,
    instanceCount,
    instanceAttributes,
    skipDefaultUniforms = false,
    debug = false,
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
    reducedMotion,
    saveData,
    staticFrame,
    className = '',
    style,
    renderOptions = RENDER_OPTIONS
}, ref) => {
    const { updaters, port, invalidation, capturesAreNonReproducible } = useUniformUpdaters(
        programId,
        uniforms,
        { skipDefaultUniforms, reducedMotion, saveData }
    );
    const {
        bindings,
        invalidation: textureInvalidation,
        config: augmentedConfig
    } = useTextureBindings(textures, shaderConfig);
    const programConfigs = { [programId]: augmentedConfig };
    const combinedInvalidation = useMemo(
        () => (textureInvalidation ? combineFrameInvalidation([invalidation, textureInvalidation]) : invalidation),
        [invalidation, textureInvalidation]
    );
    const debugPortRef = useRef<UniformDebugPort | null>(null);
    debugPortRef.current = port;

    const instancing: InstancingConfig = { instanceCount, attributes: instanceAttributes };

    return (
        <ShaderEngine
            ref={ref}
            programConfigs={programConfigs}
            renderCallback={renderFullscreenQuad}
            uniformUpdaters={updaters}
            debugPortRef={debugPortRef}
            invalidation={combinedInvalidation}
            textureBindings={bindings}
            capturesAreNonReproducible={capturesAreNonReproducible}
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
            reducedMotion={reducedMotion}
            saveData={saveData}
            staticFrame={staticFrame}
            className={className}
            style={style}
            useFastPath={true}
            debug={debug}
            renderOptions={renderOptions}
            instancing={instancing}
        />
    );
});

BaseInstancedShaderComponentImpl.displayName = 'BaseInstancedShaderComponent';

export const BaseInstancedShaderComponent = memo(BaseInstancedShaderComponentImpl);
