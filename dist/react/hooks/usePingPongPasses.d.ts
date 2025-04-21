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
export declare const usePingPongPasses: ({ programId, secondaryProgramId, iterations, uniforms, secondaryUniforms, framebufferOptions, renderOptions, customPasses }: PingPongPassesOptions) => {
    passes: RenderPass[];
    framebuffers: {
        [x: string]: FramebufferOptions;
    };
};
export {};
