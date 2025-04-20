import type { FramebufferOptions, FramebufferResources, TextureOptions } from '_shaders/core';

export class FBOManager {
    private gl: WebGLRenderingContext;
    private resources = new Map<string, FramebufferResources>();
    private floatTexturesSupported: boolean;
    private floatTextureExtension: OES_texture_float | null = null;

    constructor(gl: WebGLRenderingContext) {
        this.gl = gl;
    
        this.floatTextureExtension = gl.getExtension('OES_texture_float');
        this.floatTexturesSupported = !!this.floatTextureExtension;
    
        gl.getExtension('OES_texture_float_linear');
    }

    createFramebuffer(id: string, options: FramebufferOptions): FramebufferResources {
        const gl = this.gl;
        const { width, height, textureCount = 2, textureOptions = {} } = options;
    
        const textures: WebGLTexture[] = [];
        for (let i = 0; i < textureCount; i++) {
            const texture = this.createTexture({
                width,
                height,
                ...textureOptions
            });
            textures.push(texture);
        }
    
        const framebuffer = gl.createFramebuffer();
        
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!framebuffer) {
            throw new Error('Failed to create framebuffer');
        }
    
        const resources: FramebufferResources = {
            framebuffer,
            textures,
            currentTextureIndex: 0,
            width,
            height
        };
    
        this.resources.set(id, resources);
        return resources;
    }

    createTexture(options: TextureOptions): WebGLTexture {
        const gl = this.gl;
        const {
            width,
            height,
            internalFormat = gl.RGBA,
            format = gl.RGBA,
            type = this.floatTexturesSupported ? gl.FLOAT : gl.UNSIGNED_BYTE,
            minFilter = gl.NEAREST,
            magFilter = gl.NEAREST,
            wrapS = gl.CLAMP_TO_EDGE,
            wrapT = gl.CLAMP_TO_EDGE,
            generateMipmap = false
        } = options;
    
        const texture = gl.createTexture();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!texture) {
            throw new Error('Failed to create texture');
        }
    
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    
        if (generateMipmap) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }
    
        return texture;
    }

    bindFramebuffer(id: string | null, textureIndex?: number): void {
        const gl = this.gl;
    
        if (id === null) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return;
        }
    
        const resources = this.resources.get(id);
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
    
        const index = textureIndex ?? resources.currentTextureIndex;
    
        gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, 
            gl.COLOR_ATTACHMENT0, 
            gl.TEXTURE_2D, 
            resources.textures[index], 
            0
        );
    
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Framebuffer is not complete: ${status}`);
        }
    }

    bindTexture(id: string, textureUnit: number, textureIndex?: number): void {
        const gl = this.gl;
        const resources = this.resources.get(id);
    
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
    
        const index = textureIndex ?? resources.currentTextureIndex;
    
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, resources.textures[index]);
    }

    swapTextures(id: string): void {
        const resources = this.resources.get(id);
    
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
    
        resources.currentTextureIndex = 
      (resources.currentTextureIndex + 1) % resources.textures.length;
    }

    getPingPongIndices(id: string): { read: number; write: number } {
        const resources = this.resources.get(id);
    
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
    
        const read = resources.currentTextureIndex;
        const write = (read + 1) % resources.textures.length;
    
        return { read, write };
    }

    resizeFramebuffer(id: string, width: number, height: number): void {
        const gl = this.gl;
        const resources = this.resources.get(id);
    
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
    
        if (resources.width === width && resources.height === height) {
            return;
        }
    
        resources.textures.forEach((texture) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                width,
                height,
                0,
                gl.RGBA,
                this.floatTexturesSupported ? gl.FLOAT : gl.UNSIGNED_BYTE,
                null
            );
        });
    
        resources.width = width;
        resources.height = height;
    }

    destroy(id: string): void {
        const gl = this.gl;
        const resources = this.resources.get(id);
    
        if (!resources) return;
    
        resources.textures.forEach(texture => {
            gl.deleteTexture(texture);
        });
    
        gl.deleteFramebuffer(resources.framebuffer);
        this.resources.delete(id);
    }

    destroyAll(): void {
        Array.from(this.resources.keys()).forEach(id => {
            this.destroy(id);
        });
    }

    isFloatTexturesSupported(): boolean {
        return this.floatTexturesSupported;
    }
}
