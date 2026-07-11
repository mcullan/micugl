import { describe, expect, it } from 'vitest';

import { WebGLManager } from '@/core/managers/WebGLManager';
import type { ShaderProgramConfig } from '@/types';

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: []
};

interface ManagerStub {
    manager: WebGLManager;
    useProgramCalls: WebGLProgram[];
}

function createManager(): ManagerStub {
    const useProgramCalls: WebGLProgram[] = [];

    const gl = {
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        COMPILE_STATUS: 0x8b81,
        LINK_STATUS: 0x8b82,
        COLOR_BUFFER_BIT: 0x4000,
        canvas: { width: 300, height: 150 },
        getExtension: (): null => null,
        createShader: (): WebGLShader => ({}),
        shaderSource: (): void => undefined,
        compileShader: (): void => undefined,
        getShaderParameter: (): boolean => true,
        createProgram: (): WebGLProgram => ({}),
        attachShader: (): void => undefined,
        linkProgram: (): void => undefined,
        getProgramParameter: (): boolean => true,
        getProgramInfoLog: (): string => '',
        getUniformLocation: (): WebGLUniformLocation => ({}),
        getAttribLocation: (): number => 0,
        useProgram: (program: WebGLProgram): void => { useProgramCalls.push(program) },
        clearColor: (): void => undefined,
        clear: (): void => undefined,
        deleteProgram: (): void => undefined,
        deleteShader: (): void => undefined,
        deleteBuffer: (): void => undefined
    };

    const canvas = { getContext: (): unknown => gl } as unknown as HTMLCanvasElement;
    return { manager: new WebGLManager(canvas), useProgramCalls };
}

describe('WebGLManager program tracking', () => {
    it('issues gl.useProgram only when the active program changes', () => {
        const { manager, useProgramCalls } = createManager();
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
        const { manager, useProgramCalls } = createManager();
        manager.createProgram('a', CONFIG);

        manager.prepareRender('a');
        expect(useProgramCalls).toHaveLength(1);

        manager.destroy('a');
        manager.createProgram('a', CONFIG);
        manager.prepareRender('a');

        expect(useProgramCalls).toHaveLength(2);
    });
});
