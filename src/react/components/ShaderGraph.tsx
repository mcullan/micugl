import type { CSSProperties } from 'react';
import { forwardRef, memo, useRef } from 'react';

import type { ShaderNode } from '@/core/lib/graphPlanning';
import { PingPongShaderEngine } from '@/react/components/engine/PingPongShaderEngine';
import type { GraphDebugSource } from '@/react/hooks/useShaderGraph';
import { useShaderGraph } from '@/react/hooks/useShaderGraph';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type { PingPongShaderHandle, RenderControlProps } from '@/types';

export interface ShaderGraphProps extends Omit<RenderControlProps, 'worker' | 'createWorker'> {
    root: ShaderNode;
    className?: string;
    style?: CSSProperties;
    renderWidth?: number;
    renderHeight?: number;
    debug?: boolean;
}

const ShaderGraphComponent = forwardRef<PingPongShaderHandle, ShaderGraphProps>(({
    root,
    className,
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
    staticFrame
}, ref) => {
    const {
        programConfigs,
        passes,
        framebuffers,
        textureSources,
        port,
        graphDebug,
        invalidation,
        capturesAreNonReproducible
    } = useShaderGraph(root, { reducedMotion, saveData });

    const debugPortRef = useRef<UniformDebugPort | null>(null);
    debugPortRef.current = port;

    const graphDebugRef = useRef<GraphDebugSource | null>(null);
    graphDebugRef.current = graphDebug;

    return (
        <PingPongShaderEngine
            ref={ref}
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            textureSources={textureSources}
            debugPortRef={debugPortRef}
            graphDebugRef={graphDebugRef}
            invalidation={invalidation}
            capturesAreNonReproducible={capturesAreNonReproducible}
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

ShaderGraphComponent.displayName = 'ShaderGraph';

export const ShaderGraph = memo(ShaderGraphComponent);
