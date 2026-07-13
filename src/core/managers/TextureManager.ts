import type { SourceDimensions } from '@/core/lib/sourceTextureOptions';
import {
    assertNpotCompatible,
    isMipmapMinFilter,
    isUploadable,
    sourceDimensions,
    sourceTextureOptionsEqual,
    uploadMode
} from '@/core/lib/sourceTextureOptions';
import type { ResolvedSourceTextureOptions, TextureSource, TextureUploadSource } from '@/types';

interface SourceTextureResources {
    texture: WebGLTexture;
    dimensions: SourceDimensions | null;
    options: ResolvedSourceTextureOptions;
    uploadedVersion: number | null;
    owner: TextureSource;
}

const PLACEHOLDER_PIXEL = new Uint8Array([0, 0, 0, 0]);

function unknownTextureMessage(method: string, id: string): string {
    return `TextureManager.${method}: no source texture with id "${id}". Call defineTexture(source) before `
        + 'uploading to it or binding it.';
}

function redefineMessage(id: string): string {
    return `TextureManager.defineTexture: source texture "${id}" is already defined with different options. One `
        + 'id owns one GL texture with one set of filter/wrap/unpack parameters for its whole life, so redefining '
        + 'it would silently change how an already-bound texture samples. Use a different id, or destroy this one '
        + 'first.';
}

function foreignOwnerMessage(method: string, id: string): string {
    return `TextureManager.${method}: source texture id "${id}" is already owned by a different TextureSource `
        + 'object. One id owns one GL texture and one upload version, so two sources sharing an id would upload '
        + 'over each other, and each would skip the other\'s frames whenever their version counters happened to '
        + 'agree. Give each source its own id.';
}

function notReadyMessage(id: string, width: number, height: number): string {
    return `TextureManager: the frame for "${id}" is not an uploadable size. After rejecting dimensions that are `
        + `not positive integers it measures ${width}x${height}. A TextureSource must return null from getFrame() `
        + 'until it has a decoded frame with positive integer dimensions; returning a video that has not decoded '
        + 'yet would upload a zero-sized texture and the shader would sample black.';
}

export class TextureManager {
    private gl: WebGLRenderingContext;
    private resources = new Map<string, SourceTextureResources>();
    private maxUnits: number | null = null;

    constructor(gl: WebGLRenderingContext) {
        this.gl = gl;
    }

    maxTextureImageUnits(): number {
        if (this.maxUnits === null) {
            const limit: unknown = this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS);
            if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
                throw new Error(
                    `TextureManager: MAX_TEXTURE_IMAGE_UNITS came back as ${String(limit)}, not a positive integer. `
                    + 'A lost WebGL context reports null for every parameter, so there is no unit count to validate '
                    + 'a binding against.'
                );
            }
            this.maxUnits = limit;
        }
        return this.maxUnits;
    }

    defineTexture(source: TextureSource): void {
        const gl = this.gl;
        const { id, options } = source;
        const existing = this.resources.get(id);

        if (existing) {
            if (existing.owner !== source) {
                throw new Error(foreignOwnerMessage('defineTexture', id));
            }
            if (!sourceTextureOptionsEqual(existing.options, options)) {
                throw new Error(redefineMessage(id));
            }
            return;
        }

        const texture = gl.createTexture() as WebGLTexture | null;
        if (!texture) {
            throw new Error(`TextureManager.defineTexture: failed to create a GL texture for "${id}"`);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.magFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrapT);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, PLACEHOLDER_PIXEL
        );
        if (isMipmapMinFilter(options.minFilter)) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        this.resources.set(id, { texture, dimensions: null, options, uploadedVersion: null, owner: source });
    }

    uploadIfStale(source: TextureSource): void {
        const resources = this.resources.get(source.id);
        if (!resources) {
            throw new Error(unknownTextureMessage('uploadIfStale', source.id));
        }
        if (resources.owner !== source) {
            throw new Error(foreignOwnerMessage('uploadIfStale', source.id));
        }
        if (resources.uploadedVersion === source.version) {
            return;
        }

        const frame = source.getFrame();
        if (frame === null) {
            return;
        }

        this.uploadFrame(resources, source.id, frame);
        resources.uploadedVersion = source.version;
    }

    private uploadFrame(resources: SourceTextureResources, id: string, frame: TextureUploadSource): void {
        const gl = this.gl;
        const dimensions = sourceDimensions(frame);

        if (!isUploadable(frame)) {
            throw new Error(notReadyMessage(id, dimensions.width, dimensions.height));
        }

        const { options } = resources;
        const mode = uploadMode(resources.dimensions, dimensions);

        if (mode === 'allocate') {
            assertNpotCompatible(options, dimensions.width, dimensions.height);
        }

        gl.bindTexture(gl.TEXTURE_2D, resources.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flipY ? 1 : 0);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, options.premultiplyAlpha ? 1 : 0);

        if (mode === 'allocate') {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        }

        if (isMipmapMinFilter(options.minFilter)) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

        resources.dimensions = dimensions;
    }

    bindToUnit(id: string, unit: number): void {
        const gl = this.gl;
        const resources = this.resources.get(id);
        if (!resources) {
            throw new Error(unknownTextureMessage('bindToUnit', id));
        }

        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    }

    has(id: string): boolean {
        return this.resources.has(id);
    }

    getDimensions(id: string): SourceDimensions | null {
        return this.resources.get(id)?.dimensions ?? null;
    }

    getUploadedVersion(id: string): number | null {
        return this.resources.get(id)?.uploadedVersion ?? null;
    }

    getTextureIds(): string[] {
        return Array.from(this.resources.keys());
    }

    destroy(id: string): void {
        const resources = this.resources.get(id);
        if (!resources) return;

        this.gl.deleteTexture(resources.texture);
        this.resources.delete(id);
    }

    destroyAll(): void {
        Array.from(this.resources.keys()).forEach(id => {
            this.destroy(id);
        });
    }
}
