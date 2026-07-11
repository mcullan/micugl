import type {
    FramebufferOptions,
    FramebufferResources,
    ResolvedTextureOptions,
    TextureOptions
} from '@/core';
import { GL_HALF_FLOAT_OES } from '@/core/lib/glConstants';
import type { TextureCapabilities } from '@/core/lib/textureCapabilities';
import { resolveTextureType } from '@/core/lib/textureCapabilities';

export class FBOManager {
    private gl: WebGLRenderingContext;
    private resources = new Map<string, FramebufferResources>();
    private capabilities: TextureCapabilities;
    private floatFilterDowngraded = false;

    private lastViewportWidth = -1;
    private lastViewportHeight = -1;

    constructor(gl: WebGLRenderingContext) {
        this.gl = gl;
        this.capabilities = this.probeCapabilities();
    }

    private probeCapabilities(): TextureCapabilities {
        const gl = this.gl;

        const floatExt = gl.getExtension('OES_texture_float');
        const halfFloatExt = gl.getExtension('OES_texture_half_float');
        const floatLinearExt = gl.getExtension('OES_texture_float_linear');
        const halfFloatLinearExt = gl.getExtension('OES_texture_half_float_linear');

        const halfFloatType = halfFloatExt?.HALF_FLOAT_OES ?? GL_HALF_FLOAT_OES;

        return {
            floatRenderable: floatExt ? this.probeRenderable(gl.FLOAT) : false,
            halfFloatRenderable: halfFloatExt ? this.probeRenderable(halfFloatType) : false,
            floatLinearFilterable: !!floatLinearExt,
            halfFloatLinearFilterable: !!halfFloatLinearExt,
            halfFloatType
        };
    }

    private probeRenderable(type: number): boolean {
        const gl = this.gl;

        const texture = gl.createTexture() as WebGLTexture | null;
        const framebuffer = gl.createFramebuffer() as WebGLFramebuffer | null;
        if (!texture || !framebuffer) {
            return false;
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);

        return status === gl.FRAMEBUFFER_COMPLETE;
    }

    private resolveTextureOptions(options: Partial<TextureOptions>): ResolvedTextureOptions {
        const gl = this.gl;
        const minFilter = options.minFilter ?? gl.NEAREST;
        const magFilter = options.magFilter ?? gl.NEAREST;

        const resolved = resolveTextureType(
            { type: options.type, minFilter, magFilter },
            this.capabilities
        );

        if (resolved.filterDowngraded) {
            this.floatFilterDowngraded = true;
        }

        return {
            internalFormat: options.internalFormat ?? gl.RGBA,
            format: options.format ?? gl.RGBA,
            type: resolved.type,
            minFilter: resolved.minFilter,
            magFilter: resolved.magFilter,
            wrapS: options.wrapS ?? gl.CLAMP_TO_EDGE,
            wrapT: options.wrapT ?? gl.CLAMP_TO_EDGE
        };
    }

    private allocateTexture(width: number, height: number, resolved: ResolvedTextureOptions): WebGLTexture {
        const gl = this.gl;

        const texture = gl.createTexture() as WebGLTexture | null;
        if (!texture) {
            throw new Error('Failed to create texture');
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, resolved.internalFormat, width, height, 0,
            resolved.format, resolved.type, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, resolved.minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, resolved.magFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, resolved.wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, resolved.wrapT);

        return texture;
    }

    createFramebuffer(id: string, options: FramebufferOptions): FramebufferResources {
        const gl = this.gl;
        const { width, height, textureCount = 2, textureOptions = {} } = options;

        const resolved = this.resolveTextureOptions(textureOptions);

        const textures: WebGLTexture[] = [];
        for (let i = 0; i < textureCount; i++) {
            textures.push(this.allocateTexture(width, height, resolved));
        }

        const framebuffer = gl.createFramebuffer() as WebGLFramebuffer | null;
        if (!framebuffer) {
            throw new Error('Failed to create framebuffer');
        }

        const resources: FramebufferResources = {
            framebuffer,
            textures,
            currentTextureIndex: 0,
            width,
            height,
            textureOptions: resolved,
            lastBoundTextureIndex: -1
        };

        this.validateComplete(resources, 0);

        this.resources.set(id, resources);
        return resources;
    }

    createTexture(options: TextureOptions): WebGLTexture {
        const resolved = this.resolveTextureOptions(options);
        return this.allocateTexture(options.width, options.height, resolved);
    }

    private validateComplete(resources: FramebufferResources, index: number): void {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.textures[index], 0
        );
        resources.lastBoundTextureIndex = index;

        if (resources.width === 0 || resources.height === 0) {
            return;
        }

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Framebuffer is not complete: ${status}`);
        }
    }

    private applyViewport(width: number, height: number): void {
        if (this.lastViewportWidth === width && this.lastViewportHeight === height) {
            return;
        }
        this.gl.viewport(0, 0, width, height);
        this.lastViewportWidth = width;
        this.lastViewportHeight = height;
    }

    setCanvasViewport(width: number, height: number): void {
        this.applyViewport(width, height);
    }

    bindFramebuffer(id: string | null, textureIndex?: number): void {
        const gl = this.gl;

        if (id === null) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            const canvas = gl.canvas;
            this.applyViewport(canvas.width, canvas.height);
            return;
        }

        const resources = this.resources.get(id);
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }

        const index = textureIndex ?? resources.currentTextureIndex;

        gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
        if (index !== resources.lastBoundTextureIndex) {
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.textures[index], 0
            );
            resources.lastBoundTextureIndex = index;
        }

        this.applyViewport(resources.width, resources.height);
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

    getReadIndex(id: string): number {
        const resources = this.resources.get(id);
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
        return resources.currentTextureIndex;
    }

    getWriteIndex(id: string): number {
        const resources = this.resources.get(id);
        if (!resources) {
            throw new Error(`Framebuffer with id ${id} not found`);
        }
        return (resources.currentTextureIndex + 1) % resources.textures.length;
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

        const resolved = resources.textureOptions;
        resources.textures.forEach((texture) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
                gl.TEXTURE_2D, 0, resolved.internalFormat, width, height, 0,
                resolved.format, resolved.type, null
            );
        });

        resources.width = width;
        resources.height = height;

        this.validateComplete(resources, resources.currentTextureIndex);
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
        this.lastViewportWidth = -1;
        this.lastViewportHeight = -1;
    }

    getCapabilities(): TextureCapabilities {
        return this.capabilities;
    }

    getFramebufferIds(): string[] {
        return Array.from(this.resources.keys());
    }

    isFloatTexturesSupported(): boolean {
        return this.capabilities.floatRenderable;
    }

    wasFloatFilterDowngraded(): boolean {
        return this.floatFilterDowngraded;
    }
}
