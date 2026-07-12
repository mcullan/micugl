import { useMemo } from 'react';

import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
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
import type { FramebufferOptions, RenderPass, UniformParam } from '@/types';

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
}

const EMPTY_UNIFORMS: Record<string, UniformParam> = {};

export interface PingPongPassesWithPort extends PingPongPassesResult {
    port: UniformDebugPort;
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
    framebuffers
}: PingPongPassesOptions): PingPongPassesWithPort => {
    const primary = useUniformUpdaters(programId, uniforms);
    const secondary = useUniformUpdaters(
        secondaryProgramId ?? `${programId}-secondary`,
        secondaryUniforms
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
        () => combineUniformDebugPorts([primary.port, secondary.port]),
        [primary.port, secondary.port]
    );

    return { ...passesResult, port };
};
