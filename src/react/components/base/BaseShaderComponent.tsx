import type { CSSProperties } from 'react';
import { forwardRef, memo, useMemo, useRef } from 'react';

import type { RenderOptions, ShaderProgramConfig, ShaderRenderCallback } from '@/core';
import { combineFrameInvalidation } from '@/core';
import { ShaderEngine } from '@/react';
import type { ShaderEngineWorkerProps } from '@/react/components/engine/ShaderEngine';
import { useTextureBindings } from '@/react/hooks/useTextureBindings';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type { RenderControlProps, ShaderHandle, TextureSource, UniformParam } from '@/types';

export interface BaseShaderProps extends RenderControlProps {
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    textures?: Record<string, TextureSource>;
    skipDefaultUniforms?: boolean;
    liveUniforms?: string[];
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

const BaseShaderComponentImpl = forwardRef<ShaderHandle, BaseShaderProps>(({
    programId,
    shaderConfig,
    uniforms,
    textures,
    skipDefaultUniforms = false,
    liveUniforms,
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
    worker,
    createWorker,
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

    const workerProps: ShaderEngineWorkerProps = worker === undefined || worker === false
        ? {}
        : { worker, createWorker, workerUniforms: { [programId]: uniforms }, liveUniforms };

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
            {...workerProps}
            workerSkipDefaultUniforms={skipDefaultUniforms}
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
        />
    );
});

BaseShaderComponentImpl.displayName = 'BaseShaderComponent';

export const BaseShaderComponent = memo(BaseShaderComponentImpl);
