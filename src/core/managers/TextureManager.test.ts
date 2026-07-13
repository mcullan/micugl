import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import {
    GL_CLAMP_TO_EDGE,
    GL_LINEAR,
    GL_LINEAR_MIPMAP_LINEAR,
    GL_NEAREST,
    GL_REPEAT,
    GL_RGBA,
    GL_TEXTURE_2D,
    GL_TEXTURE_MAG_FILTER,
    GL_TEXTURE_MIN_FILTER,
    GL_TEXTURE_WRAP_S,
    GL_TEXTURE_WRAP_T,
    GL_TEXTURE0,
    GL_UNPACK_FLIP_Y_WEBGL,
    GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    GL_UNSIGNED_BYTE
} from '@/core/lib/glConstants';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { TextureManager } from '@/core/managers/TextureManager';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type {
    ResolvedSourceTextureOptions,
    SourceTextureOptions,
    TextureSource,
    TextureUploadSource
} from '@/types';

const video = (videoWidth: number, videoHeight: number): TextureUploadSource =>
    ({ videoWidth, videoHeight }) as unknown as TextureUploadSource;

const bitmap = (width: number, height: number): TextureUploadSource =>
    ({ width, height }) as unknown as TextureUploadSource;

const indexOfCall = (calls: readonly { name: string }[], name: string): number =>
    calls.findIndex(call => call.name === name);

interface SourceHandle {
    source: TextureSource;
    push: (frame: TextureUploadSource) => void;
    withhold: () => void;
    reoffer: () => void;
}

function createSource(id: string, options?: SourceTextureOptions): SourceHandle {
    let frame: TextureUploadSource | null = null;
    let offered = true;
    let version = 0;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(options),
        getFrame: () => (offered ? frame : null),
        invalidation: createFrameInvalidation()
    };

    return {
        source,
        push: (next: TextureUploadSource) => {
            frame = next;
            version += 1;
        },
        withhold: () => { offered = false },
        reoffer: () => { offered = true }
    };
}

interface Setup extends GLStubHandle {
    manager: TextureManager;
}

function setup(config?: GLStubConfig): Setup {
    const stub = createGLStub(config);
    return { ...stub, manager: new TextureManager(stub.gl) };
}

describe('TextureManager.defineTexture', () => {
    it('creates the texture, sets NPOT-safe parameters and uploads a 1x1 transparent-black placeholder', () => {
        const { manager, calls, texImage2DCalls } = setup();

        manager.defineTexture(createSource('u_image').source);

        const parameters = calls
            .filter(call => call.name === 'texParameteri')
            .map(call => [call.args[1], call.args[2]]);

        expect(calls.filter(call => call.name === 'createTexture')).toHaveLength(1);
        expect(parameters).toEqual([
            [GL_TEXTURE_MIN_FILTER, GL_LINEAR],
            [GL_TEXTURE_MAG_FILTER, GL_LINEAR],
            [GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE],
            [GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE]
        ]);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({
            internalFormat: GL_RGBA,
            width: 1,
            height: 1,
            format: GL_RGBA,
            type: GL_UNSIGNED_BYTE
        });

        const placeholder = calls[indexOfCall(calls, 'texImage2D')].args[8] as Uint8Array;
        expect(Array.from(placeholder)).toEqual([0, 0, 0, 0]);
        expect(manager.has('u_image')).toBe(true);
    });

    it('applies caller-supplied filters and wraps', () => {
        const { manager, calls } = setup();

        manager.defineTexture(createSource('u_image', {
            minFilter: GL_NEAREST,
            magFilter: GL_NEAREST,
            wrapS: GL_REPEAT,
            wrapT: GL_REPEAT
        }).source);

        const parameters = calls
            .filter(call => call.name === 'texParameteri')
            .map(call => [call.args[1], call.args[2]]);

        expect(parameters).toEqual([
            [GL_TEXTURE_MIN_FILTER, GL_NEAREST],
            [GL_TEXTURE_MAG_FILTER, GL_NEAREST],
            [GL_TEXTURE_WRAP_S, GL_REPEAT],
            [GL_TEXTURE_WRAP_T, GL_REPEAT]
        ]);
    });

    it('is a no-op when the same source is defined twice', () => {
        const { manager, calls, reset } = setup();
        const { source } = createSource('u_image');

        manager.defineTexture(source);
        reset();
        manager.defineTexture(source);

        expect(calls).toHaveLength(0);
    });

    it('throws when a source mutates its options behind an already-defined texture', () => {
        const { manager } = setup();
        const { source } = createSource('u_image');

        manager.defineTexture(source);
        source.options = resolveSourceTextureOptions({ flipY: false });

        expect(() => { manager.defineTexture(source) }).toThrow(/already defined with different options/);
    });

    it('throws when a second source object claims an id another source already owns', () => {
        const { manager } = setup();

        manager.defineTexture(createSource('u_image').source);

        expect(() => { manager.defineTexture(createSource('u_image').source) })
            .toThrow(/already owned by a different TextureSource/);
    });

    it('never generates mipmaps', () => {
        const { manager, calls } = setup();

        manager.defineTexture(createSource('u_image').source);

        expect(calls.some(call => call.name === 'generateMipmap')).toBe(false);
    });

    it('throws on a mipmap min-filter that never crossed the resolver, before it creates the texture', () => {
        const { manager, calls } = setup();
        const handBuilt: ResolvedSourceTextureOptions = {
            minFilter: GL_LINEAR_MIPMAP_LINEAR,
            magFilter: GL_LINEAR,
            wrapS: GL_CLAMP_TO_EDGE,
            wrapT: GL_CLAMP_TO_EDGE,
            flipY: true,
            premultiplyAlpha: false
        };
        const { source } = createSource('u_image');
        source.options = handBuilt;

        expect(() => { manager.defineTexture(source) }).toThrow(/mipmap filter/);
        expect(calls.some(call => call.name === 'createTexture')).toBe(false);
        expect(manager.has('u_image')).toBe(false);
    });
});

describe('TextureManager.uploadIfStale', () => {
    it('flips Y and leaves alpha straight by default, then restores the global unpack state to 0', () => {
        const { manager, calls, pixelStoreCalls, reset } = setup();
        const image = createSource('u_image');
        manager.defineTexture(image.source);

        reset();
        image.push(bitmap(640, 480));
        manager.uploadIfStale(image.source);

        expect(calls.map(call => call.name).filter(name => name === 'pixelStorei' || name === 'texImage2D'))
            .toEqual(['pixelStorei', 'pixelStorei', 'texImage2D', 'pixelStorei', 'pixelStorei']);
        expect(pixelStoreCalls).toEqual([
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 1 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 0 },
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 0 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 0 }
        ]);
    });

    it('honours flipY false and premultiplyAlpha true, and still leaves the unpack state at 0', () => {
        const { manager, pixelStoreCalls, reset } = setup();
        const image = createSource('u_image', { flipY: false, premultiplyAlpha: true });
        manager.defineTexture(image.source);

        reset();
        image.push(bitmap(640, 480));
        manager.uploadIfStale(image.source);

        expect(pixelStoreCalls).toEqual([
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 0 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 1 },
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 0 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 0 }
        ]);
    });

    it('re-sets the unpack flags on every upload so unrelated GL code cannot flip a frame', () => {
        const { manager, pixelStoreCalls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        reset();
        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);

        expect(pixelStoreCalls).toEqual([
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 1 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 0 },
            { pname: GL_UNPACK_FLIP_Y_WEBGL, param: 0 },
            { pname: GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, param: 0 }
        ]);
    });

    it('allocates with texImage2D on the first upload and updates in place afterwards', () => {
        const { manager, texImage2DCalls, texSubImage2DCalls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        reset();
        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 640, height: 480, format: GL_RGBA });
        expect(texSubImage2DCalls).toHaveLength(0);

        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texSubImage2DCalls).toHaveLength(2);
        expect(texSubImage2DCalls[0]).toMatchObject({
            xoffset: 0,
            yoffset: 0,
            width: 640,
            height: 480,
            format: GL_RGBA,
            type: GL_UNSIGNED_BYTE
        });
    });

    it('reallocates with texImage2D when the source changes dimensions mid-stream', () => {
        const { manager, texImage2DCalls, texSubImage2DCalls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        reset();

        cam.push(video(1280, 720));
        manager.uploadIfStale(cam.source);

        expect(texSubImage2DCalls).toHaveLength(0);
        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 1280, height: 720 });
        expect(manager.getDimensions('u_cam')).toEqual({ width: 1280, height: 720 });

        reset();
        cam.push(video(1280, 720));
        manager.uploadIfStale(cam.source);

        expect(texImage2DCalls).toHaveLength(0);
        expect(texSubImage2DCalls).toHaveLength(1);
        expect(texSubImage2DCalls[0]).toMatchObject({ width: 1280, height: 720 });
    });

    it('skips the upload while the version is unchanged and uploads again as soon as it advances', () => {
        const { manager, texImage2DCalls, texSubImage2DCalls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        reset();
        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        manager.uploadIfStale(cam.source);
        manager.uploadIfStale(cam.source);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texSubImage2DCalls).toHaveLength(0);
        expect(manager.getUploadedVersion('u_cam')).toBe(cam.source.version);

        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);

        expect(texSubImage2DCalls).toHaveLength(1);
    });

    it('forgets the uploaded version with the texture it described, so a re-defined id uploads again', () => {
        const { manager, texImage2DCalls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        cam.push(video(640, 480));
        manager.uploadIfStale(cam.source);
        expect(manager.getUploadedVersion('u_cam')).toBe(1);

        manager.destroy('u_cam');
        expect(manager.getUploadedVersion('u_cam')).toBeNull();

        manager.defineTexture(cam.source);
        reset();
        manager.uploadIfStale(cam.source);

        expect(cam.source.version).toBe(1);
        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 640, height: 480 });
        expect(manager.getDimensions('u_cam')).toEqual({ width: 640, height: 480 });
    });

    it('uploads once the source starts offering frames, even though its version never changed', () => {
        const { manager, texImage2DCalls, reset } = setup();
        const image = createSource('u_image');
        image.push(bitmap(4, 4));
        image.withhold();
        manager.defineTexture(image.source);

        reset();
        manager.uploadIfStale(image.source);
        expect(texImage2DCalls).toHaveLength(0);

        image.reoffer();
        manager.uploadIfStale(image.source);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 4, height: 4 });
    });

    it('throws instead of uploading a video that has not decoded a frame yet', () => {
        const { manager, calls, reset } = setup();
        const cam = createSource('u_cam');
        manager.defineTexture(cam.source);

        reset();
        cam.push(video(0, 0));

        expect(() => { manager.uploadIfStale(cam.source) }).toThrow(/not an uploadable size/);
        expect(calls.some(call => call.name === 'texImage2D')).toBe(false);
        expect(calls.some(call => call.name === 'texSubImage2D')).toBe(false);
        expect(calls.some(call => call.name === 'pixelStorei')).toBe(false);
    });

    it('throws instead of uploading a non-power-of-two source into a REPEAT-wrapped texture', () => {
        const { manager, calls, reset } = setup();
        const image = createSource('u_image', { wrapS: GL_REPEAT });
        manager.defineTexture(image.source);

        reset();
        image.push(bitmap(640, 480));

        expect(() => { manager.uploadIfStale(image.source) }).toThrow(/not power-of-two/);
        expect(calls.some(call => call.name === 'texImage2D')).toBe(false);
        expect(calls.some(call => call.name === 'pixelStorei')).toBe(false);
    });

    it('uploads a power-of-two source into a REPEAT-wrapped texture', () => {
        const { manager, texImage2DCalls, reset } = setup();
        const image = createSource('u_image', { wrapS: GL_REPEAT, wrapT: GL_REPEAT });
        manager.defineTexture(image.source);

        reset();
        image.push(bitmap(256, 256));
        manager.uploadIfStale(image.source);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 256, height: 256 });
    });

    it('throws for an id that was never defined', () => {
        const { manager } = setup();
        const image = createSource('u_missing');
        image.push(bitmap(4, 4));

        expect(() => { manager.uploadIfStale(image.source) }).toThrow(/no source texture with id/);
    });

    it('throws when a second source object uploads to an id another source owns', () => {
        const { manager } = setup();
        const owner = createSource('u_image');
        manager.defineTexture(owner.source);

        const impostor = createSource('u_image');
        impostor.push(bitmap(4, 4));

        expect(() => { manager.uploadIfStale(impostor.source) })
            .toThrow(/already owned by a different TextureSource/);
    });
});

describe('TextureManager.bindToUnit', () => {
    it('activates the unit and binds the texture to it', () => {
        const { manager, calls, reset } = setup();
        manager.defineTexture(createSource('u_image').source);

        reset();
        manager.bindToUnit('u_image', 3);

        expect(calls[0]).toMatchObject({ name: 'activeTexture', args: [GL_TEXTURE0 + 3] });
        expect(calls[1].name).toBe('bindTexture');
        expect(calls[1].args[0]).toBe(GL_TEXTURE_2D);
    });

    it('throws for an id that was never defined', () => {
        const { manager } = setup();

        expect(() => { manager.bindToUnit('u_missing', 0) }).toThrow(/no source texture with id/);
    });
});

describe('TextureManager cleanup', () => {
    it('deletes every texture it owns and forgets them', () => {
        const { manager, calls, reset } = setup();

        manager.defineTexture(createSource('a').source);
        manager.defineTexture(createSource('b').source);
        expect(manager.getTextureIds()).toEqual(['a', 'b']);

        reset();
        manager.destroyAll();

        expect(calls.filter(call => call.name === 'deleteTexture')).toHaveLength(2);
        expect(manager.has('a')).toBe(false);
        expect(manager.has('b')).toBe(false);
        expect(manager.getTextureIds()).toEqual([]);
    });

    it('deletes a single texture by id', () => {
        const { manager, calls, reset } = setup();

        manager.defineTexture(createSource('a').source);
        manager.defineTexture(createSource('b').source);

        reset();
        manager.destroy('a');

        expect(calls.filter(call => call.name === 'deleteTexture')).toHaveLength(1);
        expect(manager.has('a')).toBe(false);
        expect(manager.has('b')).toBe(true);
    });
});

describe('TextureManager.maxTextureImageUnits', () => {
    it('reads the context limit once and memoizes it', () => {
        const { manager, calls } = setup({ maxTextureImageUnits: 16 });

        expect(manager.maxTextureImageUnits()).toBe(16);
        expect(manager.maxTextureImageUnits()).toBe(16);
        expect(calls.filter(call => call.name === 'getParameter')).toHaveLength(1);
    });

    it('throws rather than memoizing the null a lost context reports', () => {
        const { manager } = setup({ overrides: { getParameter: () => null } });

        expect(() => manager.maxTextureImageUnits()).toThrow(/came back as null/);
    });
});
