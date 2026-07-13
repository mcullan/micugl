import type { CSSProperties } from 'react';
import { forwardRef, memo, useRef } from 'react';

import type { FramebufferOptions, RenderOptions, RenderPass, ShaderProgramConfig } from '@/core';
import type { PingPongShaderEngineWorkerProps } from '@/react/components/engine/PingPongShaderEngine';
import { PingPongShaderEngine } from '@/react/components/engine/PingPongShaderEngine';
import { usePingPongPasses } from '@/react/hooks/usePingPongPasses';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import { workerPingPongUniforms } from '@/react/lib/workerMode';
import type { PingPongShaderHandle, RenderControlProps, UniformParam } from '@/types';

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
    debug?: boolean;
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

const BasePingPongShaderComponentImpl = forwardRef<PingPongShaderHandle, BasePingPongShaderProps>(({
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
    debug = false,
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

    const { passes, framebuffers, port, invalidation, springsInFlight } = usePingPongPasses({
        programId,
        secondaryProgramId: secondaryShaderConfig ? actualSecondaryProgramId : undefined,
        iterations,
        uniforms,
        secondaryUniforms,
        framebufferOptions,
        renderOptions,
        customPasses,
        framebuffers: framebuffersOverride,
        reducedMotion,
        saveData
    });
    const debugPortRef = useRef<UniformDebugPort | null>(null);
    debugPortRef.current = port;

    const workerProps: PingPongShaderEngineWorkerProps = worker === undefined || worker === false
        ? {}
        : {
            worker,
            createWorker,
            workerCustomPasses: customPasses !== undefined,
            workerUniforms: workerPingPongUniforms({
                programId,
                uniforms,
                secondaryProgramId: secondaryShaderConfig ? actualSecondaryProgramId : undefined,
                secondaryUniforms,
                customPasses: customPasses !== undefined
            })
        };

    return (
        <PingPongShaderEngine
            ref={ref}
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            debugPortRef={debugPortRef}
            invalidation={invalidation}
            springsInFlight={springsInFlight}
            {...workerProps}
            className={className}
            style={style}
            width={width}
            height={height}
            renderWidth={renderWidth}
            renderHeight={renderHeight}
            debug={debug}
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
        />
    );
});

BasePingPongShaderComponentImpl.displayName = 'BasePingPongShaderComponent';

export const BasePingPongShaderComponent = memo(BasePingPongShaderComponentImpl);
