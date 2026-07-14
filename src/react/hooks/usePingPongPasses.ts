import { useMemo } from 'react';

import { combineFrameInvalidation, type FrameInvalidation } from '@/core/lib/frameInvalidation';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { CapturesAreNonReproducible } from '@/react/lib/captureLiveness';
import { combineUniformDebugPorts, type UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import {
    buildPasses,
    DEFAULT_FRAMEBUFFER_OPTIONS,
    DEFAULT_RENDER_OPTIONS,
    type PingPongPassesResult,
    type PingPongRenderOptions,
    serializeFramebufferOptions,
    serializeRenderOptions
} from '@/react/lib/pingPongPasses';
import type { FramebufferOptions, MotionPolicy, RenderPass, UniformParam } from '@/types';

interface PingPongPassesOptions {
    programId: string;
    secondaryProgramId?: string;
    iterations?: number;
    uniforms: Record<string, UniformParam>;
    secondaryUniforms?: Record<string, UniformParam>;
    framebufferOptions?: FramebufferOptions;
    renderOptions?: PingPongRenderOptions;
    customPasses?: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    reducedMotion?: MotionPolicy;
    saveData?: MotionPolicy;
}

const EMPTY_UNIFORMS: Record<string, UniformParam> = {};

export interface PingPongPassesWithPort extends PingPongPassesResult {
    port: UniformDebugPort;
    invalidation: FrameInvalidation;
    capturesAreNonReproducible: CapturesAreNonReproducible;
}

export const usePingPongPasses = ({
    programId,
    secondaryProgramId,
    iterations = 1,
    uniforms,
    secondaryUniforms = EMPTY_UNIFORMS,
    framebufferOptions = DEFAULT_FRAMEBUFFER_OPTIONS,
    renderOptions = DEFAULT_RENDER_OPTIONS,
    customPasses,
    framebuffers,
    reducedMotion,
    saveData
}: PingPongPassesOptions): PingPongPassesWithPort => {
    const primary = useUniformUpdaters(programId, uniforms, { reducedMotion, saveData });
    const secondary = useUniformUpdaters(
        secondaryProgramId ?? `${programId}-secondary`,
        secondaryUniforms,
        { reducedMotion, saveData }
    );

    const framebufferKey = serializeFramebufferOptions(framebufferOptions);
    const renderKey = serializeRenderOptions(renderOptions);
    const overrideKey = framebuffers ? JSON.stringify(framebuffers) : '';

    const passesResult = useMemo(() => {
        const framebufferOpts = JSON.parse(framebufferKey) as FramebufferOptions;
        const renderOpts = JSON.parse(renderKey) as PingPongRenderOptions;
        const override = overrideKey
            ? JSON.parse(overrideKey) as Record<string, FramebufferOptions>
            : undefined;
        return buildPasses(
            programId,
            secondaryProgramId,
            iterations,
            primary.updaters,
            secondary.updaters,
            framebufferOpts,
            renderOpts,
            customPasses,
            override
        );
    }, [
        programId,
        secondaryProgramId,
        iterations,
        primary.updaters,
        secondary.updaters,
        framebufferKey,
        renderKey,
        customPasses,
        overrideKey
    ]);

    const port = useMemo(
        () => combineUniformDebugPorts([
            { nodeId: programId, port: primary.port },
            { nodeId: secondaryProgramId ?? `${programId}-secondary`, port: secondary.port }
        ]),
        [primary.port, secondary.port, programId, secondaryProgramId]
    );

    const invalidation = useMemo(
        () => combineFrameInvalidation([primary.invalidation, secondary.invalidation]),
        [primary.invalidation, secondary.invalidation]
    );

    const primaryCapture = primary.capturesAreNonReproducible;
    const secondaryCapture = secondary.capturesAreNonReproducible;
    const capturesAreNonReproducible = useMemo<CapturesAreNonReproducible>(
        () => () => primaryCapture() ?? secondaryCapture(),
        [primaryCapture, secondaryCapture]
    );

    return { ...passesResult, port, invalidation, capturesAreNonReproducible };
};
