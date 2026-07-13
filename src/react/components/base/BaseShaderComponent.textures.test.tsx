import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ShaderRenderCallback } from '@/core';
import { createShaderConfig } from '@/core/lib/createShaderConfig';
import type { FrameInvalidation, InvalidationKind } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { BaseInstancedShaderComponent } from '@/react/components/base/BaseInstancedShaderComponent';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import { ShaderEngine } from '@/react/components/engine/ShaderEngine';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { ShaderHandle, TextureSource, TextureUploadSource } from '@/types';

const PROGRAM_ID = 'tex-demo';
const WIDTH = 320;
const HEIGHT = 200;

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;
let originalMatchMedia: typeof window.matchMedia | undefined;

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub({ extensions: { ANGLE_instanced_arrays: true } });

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    originalGetContext = canvasProto.getContext;
    originalToBlob = canvasProto.toBlob;
    canvasProto.getContext = function stubGetContext(type: string): unknown {
        return type === '2d' ? { putImageData: () => undefined, drawImage: () => undefined } : stub.gl;
    };
    canvasProto.toBlob = function stubToBlob(callback: (blob: Blob) => void, type?: string): void {
        callback(new Blob([], { type: type ?? 'image/png' }));
    };
    (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;
    delete (globalThis as { ImageData?: unknown }).ImageData;
    if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
    }
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

function mockReducedMotionActive(): void {
    window.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
}

interface FakeSource {
    source: TextureSource;
    invalidation: FrameInvalidation;
    produceFrame: (width?: number, height?: number, kind?: InvalidationKind) => void;
}

function createFakeSource(id: string): FakeSource {
    const invalidation = createFrameInvalidation();
    let frame: TextureUploadSource | null = null;
    let version = 0;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(),
        getFrame: () => frame,
        invalidation
    };

    return {
        source,
        invalidation,
        produceFrame: (width = 640, height = 480, kind: InvalidationKind = 'discrete') => {
            frame = { videoWidth: width, videoHeight: height } as unknown as TextureUploadSource;
            version += 1;
            invalidation.request(kind);
        }
    };
}

const renderQuad: ShaderRenderCallback = (_time, _resources, gl) => {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_color: 'float' }
});

const INSTANCED_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_color: 'float' },
    attributeConfigs: [{ name: 'a_offset', size: 2, type: 'FLOAT', instanced: true }]
});

function fullUploads(): { width: number; height: number }[] {
    return stub.texImage2DCalls
        .filter(call => call.width !== 1 || call.height !== 1)
        .map(call => ({ width: call.width, height: call.height }));
}

function samplerUnits(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls
        .filter(call => call.name === 'uniform1i' && call.location === location)
        .map(call => call.value);
}

function uniformFloats(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls
        .filter(call => call.name === 'uniform1f' && call.location === location)
        .map(call => call.value);
}

function count(name: string): number {
    return stub.calls.filter(call => call.name === name).length;
}

describe('BaseShaderComponent textures, headline through the public prop', () => {
    it('binds two sources to units 0 and 1, uploads only the ready one, and wakes exactly one demand frame', async () => {
        const a = createFakeSource('img-a');
        const b = createFakeSource('img-b');

        await mount(
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source, overlay: b.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        expect(samplerUnits('u_image')).toEqual([0]);
        expect(samplerUnits('u_overlay')).toEqual([1]);

        act(() => { frames.tick(0) });
        expect(fullUploads()).toEqual([]);
        expect(uniformFloats('u_color')).toContain(0.75);
        const drawsAfterMount = count('drawArrays');

        b.produceFrame(640, 480);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(fullUploads()).toEqual([{ width: 640, height: 480 }]);
        expect(count('drawArrays')).toBe(drawsAfterMount + 1);

        act(() => { frames.tick(32) });
        expect(fullUploads()).toEqual([{ width: 640, height: 480 }]);
        expect(count('drawArrays')).toBe(drawsAfterMount + 1);
    });
});

describe('BaseShaderComponent textures, discrete vs continuous under a static gate', () => {
    it('suppresses a continuous request for ten ticks but repaints once on a discrete request', async () => {
        mockReducedMotionActive();
        const a = createFakeSource('img-a');

        await mount(
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        const postersPainted = count('drawArrays');
        expect(postersPainted).toBeGreaterThan(0);

        for (let i = 1; i <= 10; i++) {
            act(() => { a.invalidation.request('continuous') });
            expect(frames.pending()).toBe(0);
            act(() => { frames.tick(16 * i) });
        }
        expect(count('drawArrays')).toBe(postersPainted);

        act(() => { a.invalidation.request('discrete') });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(200) });

        expect(count('drawArrays')).toBe(postersPainted + 1);
    });
});

describe('BaseShaderComponent textures, structural re-init when a texture is added', () => {
    it('registers a fresh second sampler on re-init and uploads it, without re-creating on a version bump', async () => {
        const a = createFakeSource('img-a');
        const b = createFakeSource('img-b');

        const render = (withOverlay: boolean): ReactElement => (
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={withOverlay ? { image: a.source, overlay: b.source } : { image: a.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        await mount(render(false));
        act(() => { frames.tick(0) });
        a.produceFrame(320, 240);
        act(() => { frames.tick(16) });
        expect(samplerUnits('u_overlay')).toEqual([]);
        const programsBeforeAdd = count('createProgram');

        await mount(render(true));
        expect(samplerUnits('u_overlay')).toEqual([1]);
        expect(count('createProgram')).toBe(programsBeforeAdd + 1);

        const preExistingReuploadsBefore = fullUploads()
            .filter(upload => upload.width === 320 && upload.height === 240).length;

        b.produceFrame(128, 96);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(32) });
        expect(fullUploads()).toContainEqual({ width: 128, height: 96 });

        const preExistingReuploadsAfter = fullUploads()
            .filter(upload => upload.width === 320 && upload.height === 240).length;
        expect(preExistingReuploadsAfter).toBe(preExistingReuploadsBefore + 1);

        const programsAfterAdd = count('createProgram');
        a.produceFrame(320, 240);
        act(() => { frames.tick(48) });
        expect(count('createProgram')).toBe(programsAfterAdd);
    });
});

describe('BaseShaderComponent textures, context restore', () => {
    it('re-defines the texture and re-uploads the current frame after a context restore epoch', async () => {
        const a = createFakeSource('img-a');

        await mount(
            <BaseShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        a.produceFrame(512, 384);
        act(() => { frames.tick(16) });
        expect(fullUploads()).toEqual([{ width: 512, height: 384 }]);

        const canvas = container.querySelector('canvas');
        if (!canvas) {
            throw new Error('no canvas mounted');
        }

        stub.reset();
        await act(async () => {
            canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
            canvas.dispatchEvent(new Event('webglcontextrestored'));
            await Promise.resolve();
        });
        act(() => { frames.tick(32) });

        expect(samplerUnits('u_image')).toEqual([0]);
        expect(fullUploads()).toEqual([{ width: 512, height: 384 }]);
    });
});

describe('BaseShaderComponent textures, worker mode', () => {
    it('fails loud at mount instead of silently ignoring the textures prop the worker cannot receive', async () => {
        const a = createFakeSource('img-a');
        const createWorker = (): Worker => ({}) as Worker;

        await expect(mount(
            <BaseShaderComponent
                worker={true}
                createWorker={createWorker}
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        )).rejects.toThrow(/"textures" prop is not supported in worker mode/);
    });
});

describe('BaseInstancedShaderComponent textures', () => {
    it('binds a texture at unit 0, uploads it, and still issues the instanced draw', async () => {
        const a = createFakeSource('img-a');
        const offsets = new Float32Array([0, 0, 0.5, 0.5]);

        await mount(
            <BaseInstancedShaderComponent
                programId={PROGRAM_ID}
                shaderConfig={INSTANCED_CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source }}
                instanceCount={2}
                instanceAttributes={{ a_offset: { data: offsets, size: 2, usage: 'dynamic' } }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        expect(samplerUnits('u_image')).toEqual([0]);

        act(() => { frames.tick(0) });
        a.produceFrame(320, 240);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(fullUploads()).toContainEqual({ width: 320, height: 240 });
        expect(count('drawArraysInstancedANGLE')).toBeGreaterThan(0);
    });
});

describe('ShaderEngine textures without the fast path', () => {
    it('throws the fast-path message at mount, one frame ahead of prepareRender', async () => {
        const a = createFakeSource('img-a');
        const config = createShaderConfig({
            vertexShader: 'void main() {}',
            fragmentShader: 'void main() {}',
            uniformNames: { u_image: 'sampler2D' }
        });

        await expect(mount(
            <ShaderEngine
                programConfigs={{ [PROGRAM_ID]: config }}
                renderCallback={renderQuad}
                textureBindings={[{ unit: 0, samplerName: 'u_image', source: a.source }]}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                useFastPath={false}
            />
        )).rejects.toThrow(/textures require useFastPath/);
    });
});

describe('BaseShaderComponent textures, capture reproducibility', () => {
    it('does not treat a ready image texture as non-reproducible: renderToBlob at an explicit frame resolves', async () => {
        const a = createFakeSource('img-a');
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(
            <BaseShaderComponent
                ref={handleRef}
                programId={PROGRAM_ID}
                shaderConfig={CONFIG}
                uniforms={{ u_color: { type: 'float', value: 0.75 } }}
                textures={{ image: a.source }}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                frameloop='demand'
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        act(() => { frames.tick(0) });
        a.produceFrame(256, 256);
        act(() => { frames.tick(16) });

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});
