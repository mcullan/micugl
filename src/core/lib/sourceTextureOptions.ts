import {
    GL_CLAMP_TO_EDGE,
    GL_LINEAR,
    GL_LINEAR_MIPMAP_LINEAR,
    GL_LINEAR_MIPMAP_NEAREST,
    GL_MIRRORED_REPEAT,
    GL_NEAREST,
    GL_NEAREST_MIPMAP_LINEAR,
    GL_NEAREST_MIPMAP_NEAREST,
    GL_REPEAT
} from '@/core/lib/glConstants';
import { isPowerOfTwo } from '@/core/lib/math';
import type { ResolvedSourceTextureOptions, SourceTextureOptions, TextureUploadSource } from '@/types';

export interface SourceDimensions {
    width: number;
    height: number;
}

export type UploadMode = 'allocate' | 'update';

const MIPMAP_MIN_FILTERS = new Set<number>([
    GL_NEAREST_MIPMAP_NEAREST,
    GL_LINEAR_MIPMAP_NEAREST,
    GL_NEAREST_MIPMAP_LINEAR,
    GL_LINEAR_MIPMAP_LINEAR
]);

const NPOT_SAFE_WRAPS = new Set<number>([GL_CLAMP_TO_EDGE]);

const REPEATING_WRAP_NAMES: Record<number, string> = {
    [GL_REPEAT]: 'REPEAT',
    [GL_MIRRORED_REPEAT]: 'MIRRORED_REPEAT'
};

const DEFAULT_SOURCE_TEXTURE_OPTIONS: ResolvedSourceTextureOptions = {
    minFilter: GL_LINEAR,
    magFilter: GL_LINEAR,
    wrapS: GL_CLAMP_TO_EDGE,
    wrapT: GL_CLAMP_TO_EDGE,
    flipY: true,
    premultiplyAlpha: false
};

function mipmapFilterMessage(filter: number): string {
    return (
        `micugl textures: minFilter ${filter} is a mipmap filter, but source textures never call generateMipmap, `
        + 'so a mipmap min-filter would make the texture incomplete and every sample would come back black. It is '
        + 'also illegal on a non-power-of-two texture in WebGL1, and images, videos and webcam frames are almost '
        + `always non-power-of-two. Use ${GL_LINEAR} (LINEAR) or ${GL_NEAREST} (NEAREST). micugl will not quietly `
        + 'downgrade the filter for you, because a silent downgrade is a picture you did not ask for.'
    );
}

function repeatingWrapMessage(axis: 'wrapS' | 'wrapT', wrap: number, width: number, height: number): string {
    const name = REPEATING_WRAP_NAMES[wrap] ?? String(wrap);
    return (
        `micugl textures: ${axis} is ${name}, but the source is ${width}x${height}, which is not power-of-two. `
        + 'WebGL1 only allows REPEAT and MIRRORED_REPEAT wrapping on power-of-two textures; on this source the '
        + 'texture would be incomplete and sample black. Either use CLAMP_TO_EDGE, or resize the source to a '
        + 'power-of-two before uploading it.'
    );
}

export function assertNonMipmapMinFilter(minFilter: number): void {
    if (MIPMAP_MIN_FILTERS.has(minFilter)) {
        throw new Error(mipmapFilterMessage(minFilter));
    }
}

export function resolveSourceTextureOptions(options?: SourceTextureOptions): ResolvedSourceTextureOptions {
    const resolved: ResolvedSourceTextureOptions = {
        minFilter: options?.minFilter ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.minFilter,
        magFilter: options?.magFilter ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.magFilter,
        wrapS: options?.wrapS ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.wrapS,
        wrapT: options?.wrapT ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.wrapT,
        flipY: options?.flipY ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.flipY,
        premultiplyAlpha: options?.premultiplyAlpha ?? DEFAULT_SOURCE_TEXTURE_OPTIONS.premultiplyAlpha
    };

    assertNonMipmapMinFilter(resolved.minFilter);

    return resolved;
}

export function sourceTextureOptionsEqual(
    a: ResolvedSourceTextureOptions,
    b: ResolvedSourceTextureOptions
): boolean {
    return a.minFilter === b.minFilter
        && a.magFilter === b.magFilter
        && a.wrapS === b.wrapS
        && a.wrapT === b.wrapT
        && a.flipY === b.flipY
        && a.premultiplyAlpha === b.premultiplyAlpha;
}

export function assertNpotCompatible(
    options: ResolvedSourceTextureOptions,
    width: number,
    height: number
): void {
    if (isPowerOfTwo(width) && isPowerOfTwo(height)) {
        return;
    }
    if (!NPOT_SAFE_WRAPS.has(options.wrapS)) {
        throw new Error(repeatingWrapMessage('wrapS', options.wrapS, width, height));
    }
    if (!NPOT_SAFE_WRAPS.has(options.wrapT)) {
        throw new Error(repeatingWrapMessage('wrapT', options.wrapT, width, height));
    }
}

function readDimension(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

interface DimensionCarrier {
    videoWidth?: unknown;
    videoHeight?: unknown;
    naturalWidth?: unknown;
    naturalHeight?: unknown;
    displayWidth?: unknown;
    displayHeight?: unknown;
    width?: unknown;
    height?: unknown;
}

function carriesNumber(carrier: DimensionCarrier, key: keyof DimensionCarrier): boolean {
    return typeof carrier[key] === 'number';
}

export function sourceDimensions(source: TextureUploadSource): SourceDimensions {
    const carrier = source as DimensionCarrier;

    if (carriesNumber(carrier, 'videoWidth')) {
        return {
            width: readDimension(carrier.videoWidth),
            height: readDimension(carrier.videoHeight)
        };
    }

    if (carriesNumber(carrier, 'naturalWidth')) {
        return {
            width: readDimension(carrier.naturalWidth),
            height: readDimension(carrier.naturalHeight)
        };
    }

    if (carriesNumber(carrier, 'displayWidth')) {
        return {
            width: readDimension(carrier.displayWidth),
            height: readDimension(carrier.displayHeight)
        };
    }

    return { width: readDimension(carrier.width), height: readDimension(carrier.height) };
}

export function isUploadable(source: TextureUploadSource): boolean {
    const { width, height } = sourceDimensions(source);
    return width > 0 && height > 0;
}

export function uploadMode(previous: SourceDimensions | null, next: SourceDimensions): UploadMode {
    if (previous === null) {
        return 'allocate';
    }
    return previous.width === next.width && previous.height === next.height ? 'update' : 'allocate';
}

export function validateTextureUnit(unit: number, maxTextureImageUnits: number): void {
    if (!Number.isInteger(unit) || unit < 0) {
        throw new Error(
            `micugl textures: texture unit ${unit} is not a non-negative integer. Texture units are indices into `
            + 'the sampler array, assigned in insertion order starting at 0.'
        );
    }
    if (unit >= maxTextureImageUnits) {
        throw new Error(
            `micugl textures: texture unit ${unit} is past this context's MAX_TEXTURE_IMAGE_UNITS `
            + `(${maxTextureImageUnits}), so binding it would sample nothing and the shader would read black. `
            + `Bind at most ${maxTextureImageUnits} textures to one program. WebGL1 guarantees at least 8.`
        );
    }
}
