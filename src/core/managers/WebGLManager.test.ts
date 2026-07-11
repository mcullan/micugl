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
