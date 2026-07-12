import { describe, expect, it } from 'vitest';

import { WebGLManager } from '@/core/managers/WebGLManager';
import { createCanvasStub } from '@/testing';
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
