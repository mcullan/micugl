import { GL_FLOAT, GL_LINEAR } from '@/core/lib/glConstants';
import type {
    FramebufferOptions,
    RenderPass,
    RenderPassUniformValue,
    ShaderProgramConfig,
    UniformConfig,
    UniformType,
    UniformUpdaterDef
} from '@/types';

export const PING_PONG_SAMPLER: UniformConfig = { name: 'u_texture0', type: 'sampler2D' };

export function declarePingPongSampler(
    configs: Record<string, ShaderProgramConfig>
): Record<string, ShaderProgramConfig> {
    return Object.fromEntries(
        Object.entries(configs).map(([id, config]) => {
            if (config.uniforms.some(uniform => uniform.name === PING_PONG_SAMPLER.name)) {
                return [id, config];
            }
            return [id, { ...config, uniforms: [...config.uniforms, PING_PONG_SAMPLER] }];
        })
    );
}

export interface PingPongRenderOptions {
    clear?: boolean;
    clearColor?: [number, number, number, number];
}

export interface PingPongPassesResult {
    passes: RenderPass[];
    framebuffers: Record<string, FramebufferOptions>;
}

export const DEFAULT_FRAMEBUFFER_OPTIONS: FramebufferOptions = {
    width: 0,
    height: 0,
    textureCount: 1,
    textureOptions: {
        type: GL_FLOAT,
        minFilter: GL_LINEAR,
        magFilter: GL_LINEAR
    }
};

export const DEFAULT_RENDER_OPTIONS: PingPongRenderOptions = { clear: true };

export function serializeFramebufferOptions(options: FramebufferOptions): string {
    return JSON.stringify({
        width: options.width,
        height: options.height,
        textureCount: options.textureCount ?? 2,
        textureOptions: options.textureOptions ?? {}
    });
}

export function serializeRenderOptions(options: PingPongRenderOptions): string {
    return JSON.stringify({
        clear: options.clear ?? true,
        clearColor: options.clearColor ?? [0, 0, 0, 1]
    });
}

export type PassUniforms = Record<string, { type: UniformType; value: RenderPassUniformValue }>;

export function passUniformsFrom(updaters: UniformUpdaterDef[]): PassUniforms {
    const result: PassUniforms = {};
    for (const updater of updaters) {
        result[updater.name] = { type: updater.type, value: updater.updateFn };
    }
    return result;
}

export function buildPasses(
    programId: string,
    secondaryProgramId: string | undefined,
    iterations: number,
    primaryUniforms: Record<string, UniformUpdaterDef[]>,
    secondaryUniforms: Record<string, UniformUpdaterDef[]>,
    framebufferOptions: FramebufferOptions,
    renderOptions: PingPongRenderOptions,
    customPasses: RenderPass[] | undefined,
    framebuffersOverride?: Record<string, FramebufferOptions>
): PingPongPassesResult {
    if (customPasses) {
        return { passes: customPasses, framebuffers: framebuffersOverride ?? {} };
    }

    const fbIdA = `${programId}-fb-a`;
    const fbIdB = `${programId}-fb-b`;
    const framebuffers = {
        [fbIdA]: framebufferOptions,
        [fbIdB]: framebufferOptions
    };

    const passes: RenderPass[] = [{
        programId,
        inputTextures: [],
        outputFramebuffer: fbIdA,
        uniforms: passUniformsFrom(primaryUniforms[programId]),
        renderOptions
    }];

    let lastTarget = fbIdA;

    for (let i = 0; i < iterations; i++) {
        const sourceId = i % 2 === 0 ? fbIdA : fbIdB;
        const targetId = i % 2 === 0 ? fbIdB : fbIdA;
        lastTarget = targetId;

        let currentProgramId = programId;
        let updaters = primaryUniforms[programId];
        if (secondaryProgramId !== undefined && i % 2 === 1) {
            currentProgramId = secondaryProgramId;
            updaters = secondaryUniforms[secondaryProgramId];
        }

        passes.push({
            programId: currentProgramId,
            inputTextures: [{ id: sourceId, textureUnit: 0, bindingType: 'read', samplerName: PING_PONG_SAMPLER.name }],
            outputFramebuffer: targetId,
            uniforms: passUniformsFrom(updaters),
            renderOptions
        });
    }

    let finalProgramId = programId;
    let finalUpdaters = primaryUniforms[programId];
    if (secondaryProgramId !== undefined) {
        finalProgramId = secondaryProgramId;
        finalUpdaters = secondaryUniforms[secondaryProgramId];
    }

    passes.push({
        programId: finalProgramId,
        inputTextures: [{ id: lastTarget, textureUnit: 0, bindingType: 'read', samplerName: PING_PONG_SAMPLER.name }],
        outputFramebuffer: null,
        uniforms: passUniformsFrom(finalUpdaters),
        renderOptions
    });

    return { passes, framebuffers };
}

const FEEDBACK_SIM_RENDER_OPTIONS: PingPongRenderOptions = { clear: false };

export function buildFeedbackPasses(
    programId: string,
    secondaryProgramId: string | undefined,
    iterations: number,
    primaryUniforms: Record<string, UniformUpdaterDef[]>,
    secondaryUniforms: Record<string, UniformUpdaterDef[]>,
    framebufferOptions: FramebufferOptions,
    renderOptions: PingPongRenderOptions,
    framebuffersOverride?: Record<string, FramebufferOptions>
): PingPongPassesResult {
    if (secondaryProgramId === undefined) {
        throw new Error(
            'buildFeedbackPasses: a feedback accumulator needs a secondaryProgramId. The simulation program writes '
            + 'RGBA state into the feedback buffer, and a separate render program reads that state to the canvas.'
        );
    }
    if (iterations < 1) {
        throw new Error(
            `buildFeedbackPasses: iterations must be at least 1, received ${String(iterations)}. Each iteration is one `
            + 'sub-step of the feedback simulation.'
        );
    }

    const feedbackId = `${programId}-feedback`;
    const framebuffers = framebuffersOverride ?? {
        [feedbackId]: { ...framebufferOptions, textureCount: 2 }
    };

    const passes: RenderPass[] = [];

    for (let i = 0; i < iterations; i++) {
        passes.push({
            programId,
            inputTextures: [{
                id: feedbackId,
                textureUnit: 0,
                bindingType: 'readwrite',
                samplerName: PING_PONG_SAMPLER.name
            }],
            outputFramebuffer: feedbackId,
            uniforms: passUniformsFrom(primaryUniforms[programId]),
            renderOptions: FEEDBACK_SIM_RENDER_OPTIONS
        });
    }

    passes.push({
        programId: secondaryProgramId,
        inputTextures: [{
            id: feedbackId,
            textureUnit: 0,
            bindingType: 'read',
            samplerName: PING_PONG_SAMPLER.name
        }],
        outputFramebuffer: null,
        uniforms: passUniformsFrom(secondaryUniforms[secondaryProgramId]),
        renderOptions
    });

    return { passes, framebuffers };
}
