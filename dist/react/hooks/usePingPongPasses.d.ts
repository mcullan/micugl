import { FramebufferOptions, RenderPass, UniformParam } from '../../types';
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
export declare const usePingPongPasses: ({ programId, secondaryProgramId, iterations, uniforms, secondaryUniforms, framebufferOptions, renderOptions, customPasses }: PingPongPassesOptions) => PingPongPassesResult;
export {};
