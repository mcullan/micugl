import { useRef } from 'react';

import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { FramebufferOptions, RenderPass, UniformParam, UniformUpdaterDef } from '@/types';

interface PingPongPassesOptions {
    programId: string;
    secondaryProgramId?: string;
    iterations?: number;
    uniforms: Record<string, UniformParam>;
    secondaryUniforms?: Record<string, UniformParam>;
    framebufferOptions?: FramebufferOptions;
    renderOptions?: {
        clear?: boolean;
        clearColor?: [number, number, number, number];
    };
    customPasses?: RenderPass[];
}

interface PingPongPassesResult {
    passes: RenderPass[];
    framebuffers: Record<string, FramebufferOptions>;
}

const DEFAULT_FRAMEBUFFER_OPTIONS: FramebufferOptions = {
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: {
        minFilter: WebGLRenderingContext.LINEAR,
        magFilter: WebGLRenderingContext.LINEAR
    }
};

const DEFAULT_RENDER_OPTIONS = { clear: true };

function serializeFramebufferOptions(opts: FramebufferOptions): string {
    return `${opts.width}|${opts.height}|${opts.textureCount ?? 1}|${JSON.stringify(opts.textureOptions ?? {})}`;
}

function serializeRenderOptions(opts: { clear?: boolean; clearColor?: [number, number, number, number] }): string {
    return `${opts.clear ?? true}|${JSON.stringify(opts.clearColor ?? [0, 0, 0, 1])}`;
}

function buildPasses(
    programId: string,
    secondaryProgramId: string | undefined,
    iterations: number,
    primaryUniforms: Record<string, UniformUpdaterDef[]>,
    secondaryUniformsConverted: Record<string, UniformUpdaterDef[]>,
    framebufferOptions: FramebufferOptions,
    renderOptions: { clear?: boolean; clearColor?: [number, number, number, number] },
    customPasses: RenderPass[] | undefined
): PingPongPassesResult {
    const fbIdA = `${programId}-fb-a`;
    const fbIdB = `${programId}-fb-b`;
    const framebuffers = {
        [fbIdA]: framebufferOptions,
        [fbIdB]: framebufferOptions
    };

    let passes: RenderPass[] = [];

    if (customPasses) {
        passes = customPasses;
    } else {
        passes.push({
            programId,
            inputTextures: [],
            outputFramebuffer: fbIdA,
            renderOptions
        });

        let lastTarget = fbIdA;

        for (let i = 0; i < iterations; i++) {
            const currentProgramId = secondaryProgramId && i % 2 === 1
                ? secondaryProgramId
                : programId;
            
            const sourceId = i % 2 === 0 ? fbIdA : fbIdB;
            const targetId = i % 2 === 0 ? fbIdB : fbIdA;
            lastTarget = targetId;

            const currentUniforms = secondaryProgramId && i % 2 === 1
                ? secondaryUniformsConverted[secondaryProgramId]
                : primaryUniforms[programId];
            
            const passUniforms: Record<string, any> = {};
            
            currentUniforms.forEach(updater => {
                const originalUpdateFn = updater.updateFn;
                
                passUniforms[updater.name] = {
                    type: updater.type,
                    value: (time: number, width: number, height: number) => {
                        return originalUpdateFn(time, width, height);
                    }
                };
            });

            passes.push({
                programId: currentProgramId,
                inputTextures: [{
                    id: sourceId,
                    textureUnit: 0,
                    bindingType: 'read'
                }],
                outputFramebuffer: targetId,
                uniforms: passUniforms,
                renderOptions
            });
        }

        const finalSourceId = lastTarget;
        
        const finalUniforms: Record<string, any> = {};
        const finalUpdatersMap = secondaryProgramId 
            ? secondaryUniformsConverted[secondaryProgramId] 
            : primaryUniforms[programId];
        
        finalUpdatersMap.forEach(updater => {
            const originalUpdateFn = updater.updateFn;
            
            finalUniforms[updater.name] = {
                type: updater.type,
                value: (time: number, width: number, height: number) => {
                    return originalUpdateFn(time, width, height);
                }
            };
        });
        
        passes.push({
            programId: secondaryProgramId ?? programId,
            inputTextures: [{
                id: finalSourceId,
                textureUnit: 0,
                bindingType: 'read'
            }],
            outputFramebuffer: null,
            uniforms: finalUniforms,
            renderOptions
        });
    }

    return { passes, framebuffers };
}

export const usePingPongPasses = ({
    programId,
    secondaryProgramId,
    iterations = 1,
    uniforms,
    secondaryUniforms = {},
    framebufferOptions = DEFAULT_FRAMEBUFFER_OPTIONS,
    renderOptions = DEFAULT_RENDER_OPTIONS,
    customPasses
}: PingPongPassesOptions) => {
    const primaryUniforms = useUniformUpdaters(programId, uniforms);
    const secondaryUniformsConverted = useUniformUpdaters(
        secondaryProgramId ?? `${programId}-secondary`,
        secondaryUniforms
    );

    const cacheRef = useRef<{
        key: string;
        result: PingPongPassesResult;
    } | null>(null);

    const fbKey = serializeFramebufferOptions(framebufferOptions);
    const roKey = serializeRenderOptions(renderOptions);
    const customKey = customPasses ? customPasses.length.toString() : 'none';
    const cacheKey = `${programId}|${secondaryProgramId ?? ''}|${iterations}|${fbKey}|${roKey}|${customKey}`;

    if (cacheRef.current && cacheRef.current.key === cacheKey) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (window as any).__micuglMetrics.hookCacheHits++;
        }
        return cacheRef.current.result;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (window as any).__micuglMetrics.hookCacheMisses++;
    }

    const result = buildPasses(
        programId,
        secondaryProgramId,
        iterations,
        primaryUniforms,
        secondaryUniformsConverted,
        framebufferOptions,
        renderOptions,
        customPasses
    );

    cacheRef.current = { key: cacheKey, result };
    return result;
};
