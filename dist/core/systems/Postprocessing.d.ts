import { WebGLManager } from '../managers/WebGLManager';
import { FramebufferOptions, RenderPass, ShaderProgramConfig, UniformParam } from '../../types';
export interface PostProcessEffect {
    id: string;
    programId: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, UniformParam>;
    enabled: boolean;
}
export interface PostProcessChain {
    id: string;
    effects: PostProcessEffect[];
    inputFramebufferId: string;
    outputFramebufferId: string | null;
    intermediateFramebufferIds: string[];
}
export declare class Postprocessing {
    private webglManager;
    private effects;
    private chains;
    private defaultFramebufferOptions;
    constructor(webglManager: WebGLManager);
    registerEffect(effect: PostProcessEffect): void;
    removeEffect(effectId: string): void;
    createChain(chainId: string, effectIds: string[], inputFramebufferId: string, outputFramebufferId?: string | null, framebufferOptions?: FramebufferOptions): void;
    removeChain(chainId: string): void;
    generatePasses(chainId: string, _time: number): RenderPass[];
    process(chainId: string, time: number): void;
    resizeFramebuffers(width: number, height: number): void;
    destroyAll(): void;
}
