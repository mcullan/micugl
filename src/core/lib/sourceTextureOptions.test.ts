import { describe, expect, it } from 'vitest';

import {
    GL_CLAMP_TO_EDGE,
    GL_LINEAR,
    GL_LINEAR_MIPMAP_LINEAR,
    GL_MIRRORED_REPEAT,
    GL_NEAREST,
    GL_NEAREST_MIPMAP_NEAREST,
    GL_REPEAT
} from '@/core/lib/glConstants';
import {
    assertNonMipmapMinFilter,
    assertNpotCompatible,
    isUploadable,
    resolveSourceTextureOptions,
    sourceDimensions,
    sourceTextureOptionsEqual,
    uploadMode,
    validateTextureUnit
} from '@/core/lib/sourceTextureOptions';
import type { TextureUploadSource } from '@/types';

const asSource = (value: unknown): TextureUploadSource => value as TextureUploadSource;

describe('resolveSourceTextureOptions', () => {
    it('defaults to NPOT-safe parameters that are legal for any image, video or webcam frame', () => {
        const resolved = resolveSourceTextureOptions();

        expect(resolved).toEqual({
            minFilter: GL_LINEAR,
            magFilter: GL_LINEAR,
            wrapS: GL_CLAMP_TO_EDGE,
            wrapT: GL_CLAMP_TO_EDGE,
            flipY: true,
            premultiplyAlpha: false
        });
    });

    it('keeps every caller-supplied option', () => {
        const resolved = resolveSourceTextureOptions({
            minFilter: GL_NEAREST,
            magFilter: GL_NEAREST,
            wrapS: GL_REPEAT,
            wrapT: GL_MIRRORED_REPEAT,
            flipY: false,
            premultiplyAlpha: true
        });

        expect(resolved).toEqual({
            minFilter: GL_NEAREST,
            magFilter: GL_NEAREST,
            wrapS: GL_REPEAT,
            wrapT: GL_MIRRORED_REPEAT,
            flipY: false,
            premultiplyAlpha: true
        });
    });

    it('throws on a mipmap min-filter instead of silently downgrading it to LINEAR', () => {
        expect(() => resolveSourceTextureOptions({ minFilter: GL_LINEAR_MIPMAP_LINEAR }))
            .toThrow(/mipmap filter/);
        expect(() => resolveSourceTextureOptions({ minFilter: GL_NEAREST_MIPMAP_NEAREST }))
            .toThrow(/will not quietly downgrade/);
    });
});

describe('sourceTextureOptionsEqual', () => {
    it('compares resolved options by value', () => {
        const a = resolveSourceTextureOptions();
        const b = resolveSourceTextureOptions({ flipY: true });
        const c = resolveSourceTextureOptions({ flipY: false });

        expect(sourceTextureOptionsEqual(a, b)).toBe(true);
        expect(sourceTextureOptionsEqual(a, c)).toBe(false);
    });
});

describe('assertNonMipmapMinFilter', () => {
    it('rejects every mipmap min-filter and accepts the two that need no mipmaps', () => {
        expect(() => { assertNonMipmapMinFilter(GL_LINEAR_MIPMAP_LINEAR) }).toThrow(/mipmap filter/);
        expect(() => { assertNonMipmapMinFilter(GL_NEAREST_MIPMAP_NEAREST) }).toThrow(/mipmap filter/);
        expect(() => { assertNonMipmapMinFilter(GL_LINEAR) }).not.toThrow();
        expect(() => { assertNonMipmapMinFilter(GL_NEAREST) }).not.toThrow();
    });
});

describe('assertNpotCompatible', () => {
    it('accepts CLAMP_TO_EDGE on a non-power-of-two source', () => {
        const options = resolveSourceTextureOptions();
        expect(() => { assertNpotCompatible(options, 640, 480) }).not.toThrow();
    });

    it('throws when REPEAT wrap meets a non-power-of-two source', () => {
        const options = resolveSourceTextureOptions({ wrapS: GL_REPEAT });
        expect(() => { assertNpotCompatible(options, 640, 480) }).toThrow(/not power-of-two/);
    });

    it('throws when only the T axis repeats on a non-power-of-two source', () => {
        const options = resolveSourceTextureOptions({ wrapT: GL_MIRRORED_REPEAT });
        expect(() => { assertNpotCompatible(options, 640, 480) }).toThrow(/wrapT is MIRRORED_REPEAT/);
    });

    it('accepts REPEAT wrap once the source is power-of-two on both axes', () => {
        const options = resolveSourceTextureOptions({ wrapS: GL_REPEAT, wrapT: GL_REPEAT });
        expect(() => { assertNpotCompatible(options, 256, 512) }).not.toThrow();
    });

    it('rejects REPEAT when only one axis is power-of-two', () => {
        const options = resolveSourceTextureOptions({ wrapS: GL_REPEAT, wrapT: GL_REPEAT });
        expect(() => { assertNpotCompatible(options, 256, 480) }).toThrow(/not power-of-two/);
    });
});

describe('sourceDimensions', () => {
    it('reads a video from videoWidth/videoHeight, never from its layout width/height', () => {
        const video = asSource({ videoWidth: 1280, videoHeight: 720, width: 300, height: 150 });
        expect(sourceDimensions(video)).toEqual({ width: 1280, height: 720 });
    });

    it('reads an image from naturalWidth/naturalHeight, never from its layout width/height', () => {
        const image = asSource({ naturalWidth: 800, naturalHeight: 600, width: 100, height: 100 });
        expect(sourceDimensions(image)).toEqual({ width: 800, height: 600 });
    });

    it('reads a VideoFrame from displayWidth/displayHeight, which is the size WebGL uploads', () => {
        const frame = asSource({ displayWidth: 640, displayHeight: 360 });
        expect(sourceDimensions(frame)).toEqual({ width: 640, height: 360 });
    });

    it('prefers a VideoFrame\'s display size over its coded size, which may be padded or anamorphic', () => {
        const anamorphic = asSource({
            codedWidth: 1440,
            codedHeight: 1088,
            displayWidth: 1920,
            displayHeight: 1080
        });
        expect(sourceDimensions(anamorphic)).toEqual({ width: 1920, height: 1080 });
    });

    it('reads a bitmap, canvas or ImageData from width/height', () => {
        expect(sourceDimensions(asSource({ width: 64, height: 32 }))).toEqual({ width: 64, height: 32 });
    });

    it('reports zero for an undecoded video rather than falling back to its layout size', () => {
        const video = asSource({ videoWidth: 0, videoHeight: 0, width: 300, height: 150 });
        expect(sourceDimensions(video)).toEqual({ width: 0, height: 0 });
    });

    it('reports zero for an undecoded image rather than falling back to its layout size', () => {
        const image = asSource({ naturalWidth: 0, naturalHeight: 0, width: 300, height: 150 });
        expect(sourceDimensions(image)).toEqual({ width: 0, height: 0 });
    });

    it('zeroes any dimension that is not a positive integer', () => {
        expect(sourceDimensions(asSource({ width: Number.NaN, height: 32 })))
            .toEqual({ width: 0, height: 32 });
        expect(sourceDimensions(asSource({ width: -8, height: 32 })))
            .toEqual({ width: 0, height: 32 });
        expect(sourceDimensions(asSource({ width: 12.5, height: 32 })))
            .toEqual({ width: 0, height: 32 });
        expect(sourceDimensions(asSource({ height: 32 })))
            .toEqual({ width: 0, height: 32 });
    });
});

describe('isUploadable', () => {
    it('is true only when both dimensions are positive integers', () => {
        expect(isUploadable(asSource({ width: 640, height: 480 }))).toBe(true);
        expect(isUploadable(asSource({ videoWidth: 1280, videoHeight: 720 }))).toBe(true);
    });

    it('is false for a video that has not decoded a frame yet, even with a layout size set', () => {
        expect(isUploadable(asSource({ videoWidth: 0, videoHeight: 0 }))).toBe(false);
        expect(isUploadable(asSource({ videoWidth: 0, videoHeight: 0, width: 300, height: 150 }))).toBe(false);
    });

    it('is false for NaN, undefined, negative and fractional dimensions', () => {
        expect(isUploadable(asSource({ width: Number.NaN, height: Number.NaN }))).toBe(false);
        expect(isUploadable(asSource({}))).toBe(false);
        expect(isUploadable(asSource({ width: -1, height: -1 }))).toBe(false);
        expect(isUploadable(asSource({ width: 10.5, height: 10.5 }))).toBe(false);
        expect(isUploadable(asSource({ width: 640, height: 0 }))).toBe(false);
    });
});

describe('uploadMode', () => {
    it('allocates on the first upload', () => {
        expect(uploadMode(null, { width: 640, height: 480 })).toBe('allocate');
    });

    it('updates in place when the dimensions are unchanged', () => {
        expect(uploadMode({ width: 640, height: 480 }, { width: 640, height: 480 })).toBe('update');
    });

    it('reallocates when the source changes dimensions mid-stream', () => {
        expect(uploadMode({ width: 640, height: 480 }, { width: 1280, height: 720 })).toBe('allocate');
        expect(uploadMode({ width: 640, height: 480 }, { width: 640, height: 481 })).toBe('allocate');
        expect(uploadMode({ width: 640, height: 480 }, { width: 641, height: 480 })).toBe('allocate');
    });
});

describe('validateTextureUnit', () => {
    it('accepts every unit below the context limit', () => {
        expect(() => { validateTextureUnit(0, 8) }).not.toThrow();
        expect(() => { validateTextureUnit(7, 8) }).not.toThrow();
    });

    it('throws at the limit rather than binding a unit the shader cannot sample', () => {
        expect(() => { validateTextureUnit(8, 8) }).toThrow(/MAX_TEXTURE_IMAGE_UNITS/);
    });

    it('throws on a negative or fractional unit', () => {
        expect(() => { validateTextureUnit(-1, 8) }).toThrow(/non-negative integer/);
        expect(() => { validateTextureUnit(1.5, 8) }).toThrow(/non-negative integer/);
    });
});
