import { useMemo } from 'react';

import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { FramebufferOptions, RenderPass, UniformParam } from '@/types';

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

export const usePingPongPasses = ({
    programId,
    secondaryProgramId,
    iterations = 1,
    uniforms,
    secondaryUniforms = {},
    framebufferOptions = {
        width: 0,
        height: 0,
        textureCount: 2,
        textureOptions: {
            minFilter: WebGLRenderingContext.LINEAR,
            magFilter: WebGLRenderingContext.LINEAR
        }
    },
    renderOptions = { clear: true },
    customPasses
}: PingPongPassesOptions) => {
    const primaryUniforms = useUniformUpdaters(programId, uniforms);
    const secondaryUniformsConverted = useUniformUpdaters(
        secondaryProgramId ?? `${programId}-secondary`,
        secondaryUniforms
    );

    return useMemo(() => {
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

            for (let i = 0; i < iterations; i++) {
                const currentProgramId = secondaryProgramId && i % 2 === 1
                    ? secondaryProgramId
                    : programId;
                
                const sourceId = i % 2 === 0 ? fbIdA : fbIdB;
                const targetId = i % 2 === 0 ? fbIdB : fbIdA;

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

            const finalSourceId = iterations % 2 === 0 ? fbIdB : fbIdA;
            
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
    }, [
        programId,
        secondaryProgramId,
        iterations,
        primaryUniforms,
        secondaryUniformsConverted,
        framebufferOptions,
        renderOptions,
        customPasses
    ]);
};
