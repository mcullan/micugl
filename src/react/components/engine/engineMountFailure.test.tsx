import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { GL_NEAREST, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { BasePingPongShaderComponent } from '@/react/components/base/BasePingPongShaderComponent';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FramebufferOptions } from '@/types';

const PROGRAM_ID = 'mount-failure';
const WIDTH = 64;
const HEIGHT = 32;

const BYTE_FRAMEBUFFERS: FramebufferOptions = {
    width: 0,
    height: 0,
    textureCount: 1,
    textureOptions: { type: GL_UNSIGNED_BYTE, minFilter: GL_NEAREST, magFilter: GL_NEAREST }
};

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_swirl: 'float' }
});

let stub: GLStubHandle;
let container: HTMLDivElement;
let root: Root;
let originalGetContext: unknown;

beforeEach(() => {
    stub = createGLStub({ activeUniforms: { u_time: 'float', u_resolution: 'vec2', u_swirl: 'float' } });

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
    originalGetContext = canvasProto.getContext;
    canvasProto.getContext = function stubGetContext(): unknown {
        return stub.gl;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    container.remove();

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
    canvasProto.getContext = originalGetContext;
});

function createdPrograms(handle: GLStubHandle): unknown[] {
    return handle.calls.filter(call => call.name === 'linkProgram').map(call => call.args[0]);
}

function deletedPrograms(handle: GLStubHandle): unknown[] {
    return handle.calls.filter(call => call.name === 'deleteProgram').map(call => call.args[0]);
}

describe('an engine whose mount effect throws', () => {
    it('destroys the programs and buffers it already created, instead of leaking the context', () => {
        expect(() => {
            act(() => {
                root.render(
                    <BaseShaderComponent
                        programId={PROGRAM_ID}
                        shaderConfig={CONFIG}
                        uniforms={{ glow: { type: 'float', value: 1 } }}
                        width={WIDTH}
                        height={HEIGHT}
                        useDevicePixelRatio={false}
                        frameloop='demand'
                    />
                );
            });
        }).toThrow(/Uniform "u_glow".*never declared/s);

        expect(createdPrograms(stub)).toHaveLength(1);
        expect(deletedPrograms(stub)).toEqual(createdPrograms(stub));
    });

    it('destroys every program of a ping-pong chain when a later pass fails to build', () => {
        expect(() => {
            act(() => {
                root.render(
                    <BasePingPongShaderComponent
                        programId={PROGRAM_ID}
                        shaderConfig={CONFIG}
                        uniforms={{ glow: { type: 'float', value: 1 } }}
                        framebufferOptions={BYTE_FRAMEBUFFERS}
                        width={WIDTH}
                        height={HEIGHT}
                        useDevicePixelRatio={false}
                        frameloop='demand'
                    />
                );
            });
        }).toThrow(/Uniform "u_glow".*never declared/s);

        expect(createdPrograms(stub)).toHaveLength(1);
        expect(deletedPrograms(stub)).toEqual(createdPrograms(stub));
    });
});
