import { FramebufferOptions, FramebufferResources, TextureOptions } from '..';
export declare class FBOManager {
    private gl;
    private resources;
    private floatTexturesSupported;
    private floatTextureExtension;
    constructor(gl: WebGLRenderingContext);
    createFramebuffer(id: string, options: FramebufferOptions): FramebufferResources;
    createTexture(options: TextureOptions): WebGLTexture;
    bindFramebuffer(id: string | null, textureIndex?: number): void;
    bindTexture(id: string, textureUnit: number, textureIndex?: number): void;
    swapTextures(id: string): void;
    getPingPongIndices(id: string): {
        read: number;
        write: number;
    };
    resizeFramebuffer(id: string, width: number, height: number): void;
    destroy(id: string): void;
    destroyAll(): void;
    isFloatTexturesSupported(): boolean;
}
