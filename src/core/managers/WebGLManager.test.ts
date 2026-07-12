import { describe, expect, it } from 'vitest';

import { WebGLManager } from '@/core/managers/WebGLManager';
import { createCanvasStub, createGLStub } from '@/testing';
import type { ShaderProgramConfig } from '@/types';

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: []
};

describe('WebGLManager program tracking', () => {
    it('issues gl.useProgram only when the active program changes', () => {
        const { canvas, useProgramCalls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);
        manager.createProgram('b', CONFIG);

        manager.prepareRender('a');
        manager.prepareRender('a');
        manager.prepareRender('b');
        manager.prepareRender('b');
        manager.prepareRender('a');

        expect(useProgramCalls).toHaveLength(3);
    });

    it('re-issues gl.useProgram for a program recreated after destroying the current one', () => {
        const { canvas, useProgramCalls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);

        manager.prepareRender('a');
        expect(useProgramCalls).toHaveLength(1);

        manager.destroy('a');
        manager.createProgram('a', CONFIG);
        manager.prepareRender('a');

        expect(useProgramCalls).toHaveLength(2);
    });
});

describe('WebGLManager readPixels', () => {
    it('reads from the currently bound framebuffer without changing any binding itself', () => {
        const { canvas, readPixelsCalls, calls } = createCanvasStub();
        const manager = new WebGLManager(canvas);

        const pixels = manager.readPixels(4, 3);

        expect(pixels).toBeInstanceOf(Uint8ClampedArray);
        expect(pixels.length).toBe(4 * 3 * 4);
        expect(readPixelsCalls).toHaveLength(1);
        expect(readPixelsCalls[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 3 });
        expect(calls.some(call => call.name === 'bindFramebuffer')).toBe(false);
    });

    it('throws instead of reading when the context is lost', () => {
        const { canvas } = createCanvasStub({ contextLost: true });
        const manager = new WebGLManager(canvas);

        expect(() => manager.readPixels(4, 4)).toThrow(/context is lost/);
    });
});

describe('WebGLManager drawArraysInstanced', () => {
    it('uses drawArraysInstancedANGLE when ANGLE_instanced_arrays is present', () => {
        const { canvas, calls } = createCanvasStub({ extensions: { ANGLE_instanced_arrays: true } });
        const manager = new WebGLManager(canvas);

        manager.drawArraysInstanced(1, 0, 4, 10);

        const drawCalls = calls.filter(c => c.name === 'drawArraysInstancedANGLE');
        expect(drawCalls).toHaveLength(1);
        expect(drawCalls[0]?.args).toEqual([1, 0, 4, 10]);
    });

    it('falls back to gl.drawArraysInstanced when the extension lacks the function', () => {
        const drawArraysInstancedCalls: [number, number, number, number][] = [];
        const { canvas } = createCanvasStub({
            extensions: { ANGLE_instanced_arrays: false },
            overrides: {
                drawArraysInstanced: (mode: number, first: number, count: number, instanceCount: number): void => {
                    drawArraysInstancedCalls.push([mode, first, count, instanceCount]);
                }
            }
        });
        const manager = new WebGLManager(canvas);

        manager.drawArraysInstanced(1, 0, 4, 10);

        expect(drawArraysInstancedCalls).toHaveLength(1);
        expect(drawArraysInstancedCalls[0]).toEqual([1, 0, 4, 10]);
    });

    it('throws when neither ANGLE_instanced_arrays nor gl.drawArraysInstanced is available', () => {
        const { canvas } = createCanvasStub({
            extensions: { ANGLE_instanced_arrays: false },
            overrides: { drawArraysInstanced: undefined }
        });
        const manager = new WebGLManager(canvas);

        expect(() => { manager.drawArraysInstanced(1, 0, 4, 10) }).toThrow(/ANGLE_instanced_arrays/);
    });
});

describe('WebGLManager instanced buffer usage', () => {
    it('passes DYNAMIC_DRAW to bufferData when usage is dynamic', () => {
        const { canvas, calls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);

        manager.createBuffer('a', 'offset', new Float32Array([1, 2, 3, 4]), 'dynamic');

        const bufferDataCall = calls.find(c => c.name === 'bufferData');
        expect(bufferDataCall?.args[2]).toBe(manager.context.DYNAMIC_DRAW);
    });

    it('passes STATIC_DRAW to bufferData by default', () => {
        const { canvas, calls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);

        manager.createBuffer('a', 'offset', new Float32Array([1, 2, 3, 4]));

        const bufferDataCall = calls.find(c => c.name === 'bufferData');
        expect(bufferDataCall?.args[2]).toBe(manager.context.STATIC_DRAW);
    });
});

describe('WebGLManager updateBufferSub', () => {
    it('calls bufferSubData (not bufferData) with the given offset', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);
        manager.createBuffer('a', 'offset', new Float32Array([0, 0, 0, 0]));
        reset();

        const update = new Float32Array([1, 2]);
        manager.updateBufferSub('a', 'offset', update, 4);

        expect(calls.some(c => c.name === 'bufferData')).toBe(false);
        const subCall = calls.find(c => c.name === 'bufferSubData');
        expect(subCall?.args).toEqual([manager.context.ARRAY_BUFFER, 4, update]);
    });

    it('throws when the write would exceed the allocated buffer', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);
        manager.createBuffer('a', 'offset', new Float32Array([0, 0, 0, 0]));

        const update = new Float32Array([1, 2, 3, 4, 5]);
        expect(() => { manager.updateBufferSub('a', 'offset', update, 4) }).toThrow(/allocated/);
    });

    it('throws when the buffer does not exist', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('a', CONFIG);

        expect(() => { manager.updateBufferSub('a', 'offset', new Float32Array([1])) }).toThrow(/not found/);
    });
});

describe('WebGLManager offscreen canvas', () => {
    it('sizes an OffscreenCanvas without touching a style object it does not have', () => {
        const offscreen = { width: 0, height: 0 } as unknown as OffscreenCanvas;
        const { gl, viewportCalls } = createGLStub({ overrides: { canvas: offscreen } });
        const manager = new WebGLManager({
            getContext: () => gl
        } as unknown as OffscreenCanvas);

        expect(() => { manager.setSize(320, 240, 160, 120) }).not.toThrow();

        expect(offscreen.width).toBe(320);
        expect(offscreen.height).toBe(240);
        expect(viewportCalls).toContainEqual([0, 0, 320, 240]);
        expect(Object.keys(offscreen)).toEqual(['width', 'height']);
    });

    it('still applies the css display size to an HTMLCanvasElement', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);

        manager.setSize(320, 240, 160, 120);

        expect(canvas.style.width).toBe('160px');
        expect(canvas.style.height).toBe('120px');
    });
});
