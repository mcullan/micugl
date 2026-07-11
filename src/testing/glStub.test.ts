import { describe, expect, it } from 'vitest';

import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { createCanvasStub, createGLStub } from '@/testing';

describe('createGLStub unstubbed calls', () => {
    it('throws a descriptive error when calling a method the stub does not model', () => {
        const { gl } = createGLStub();

        expect(() => (gl as unknown as { getError: () => number }).getError())
            .toThrow(/micugl test stub: unstubbed GL call gl\.getError\(\.\.\.\)/);
    });

    it('does not throw when merely reading an unmodeled method reference', () => {
        const { gl } = createGLStub();

        expect(() => (gl as unknown as { getError: unknown }).getError).not.toThrow();
    });
});

describe('createGLStub enum-like fallback', () => {
    it('returns a stable synthetic number for an unmodeled enum-looking property', () => {
        const { gl } = createGLStub();
        const stub = gl as unknown as Record<string, unknown>;

        const first = stub.DEPTH_TEST;
        const second = stub.DEPTH_TEST;

        expect(typeof first).toBe('number');
        expect(first).toBe(second);
    });

    it('gives different unmodeled enum names different synthetic numbers', () => {
        const { gl } = createGLStub();
        const stub = gl as unknown as Record<string, unknown>;

        expect(stub.DEPTH_TEST).not.toBe(stub.STENCIL_TEST);
    });
});

describe('createGLStub capability configuration', () => {
    it('reflects renderableTypes in checkFramebufferStatus', () => {
        const { gl } = createGLStub({
            extensions: { OES_texture_float: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });

        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, GL_FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
    });

    it('reports incomplete when the bound texture type is not renderable', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });

        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, GL_FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).not.toBe(gl.FRAMEBUFFER_COMPLETE);
    });

    it('reflects compileFails in getShaderParameter and getShaderInfoLog', () => {
        const { gl } = createGLStub({ compileFails: true });
        const shader = gl.createShader(gl.VERTEX_SHADER);
        if (!shader) {
            throw new Error('expected stub to create a shader');
        }

        expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS)).toBe(false);
        expect(gl.getShaderInfoLog(shader)).not.toBe('');
    });

    it('reflects linkFails in getProgramParameter and getProgramInfoLog', () => {
        const { gl } = createGLStub({ linkFails: true });
        const program = gl.createProgram();

        expect(gl.getProgramParameter(program, gl.LINK_STATUS)).toBe(false);
        expect(gl.getProgramInfoLog(program)).not.toBe('');
    });

    it('reflects missingAttributes in getAttribLocation', () => {
        const { gl } = createGLStub({ missingAttributes: ['a_missing'] });
        const program = gl.createProgram();

        expect(gl.getAttribLocation(program, 'a_missing')).toBe(-1);
        expect(gl.getAttribLocation(program, 'a_position')).toBe(0);
        expect(gl.getAttribLocation(program, 'a_normal')).toBe(1);
    });
});

describe('createGLStub call log ordering and typed views', () => {
    it('records calls in invocation order in the generic calls log', () => {
        const { gl, calls } = createGLStub();

        gl.viewport(0, 0, 4, 4);
        gl.clear(gl.COLOR_BUFFER_BIT);

        expect(calls.map(call => call.name)).toEqual(['viewport', 'clear']);
    });

    it('populates texImage2DCalls', () => {
        const { gl, texImage2DCalls } = createGLStub();
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        expect(texImage2DCalls).toEqual([
            { internalFormat: gl.RGBA, width: 4, height: 8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }
        ]);
    });

    it('populates viewportCalls', () => {
        const { gl, viewportCalls } = createGLStub();

        gl.viewport(1, 2, 3, 4);

        expect(viewportCalls).toEqual([[1, 2, 3, 4]]);
    });

    it('populates useProgramCalls', () => {
        const { gl, useProgramCalls } = createGLStub();
        const program = gl.createProgram();

        gl.useProgram(program);

        expect(useProgramCalls).toEqual([program]);
    });

    it('populates uniformCalls across the uniform* family', () => {
        const { gl, uniformCalls } = createGLStub();
        const program = gl.createProgram();
        gl.useProgram(program);
        const location = gl.getUniformLocation(program, 'u_x');

        gl.uniform1f(location, 1);
        gl.uniform1i(location, 2);
        gl.uniform2fv(location, [1, 2]);
        gl.uniform3fv(location, [1, 2, 3]);
        gl.uniform4fv(location, [1, 2, 3, 4]);
        gl.uniformMatrix2fv(location, false, [1, 0, 0, 1]);
        gl.uniformMatrix3fv(location, false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        gl.uniformMatrix4fv(location, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

        expect(uniformCalls.map(call => call.name)).toEqual([
            'uniform1f',
            'uniform1i',
            'uniform2fv',
            'uniform3fv',
            'uniform4fv',
            'uniformMatrix2fv',
            'uniformMatrix3fv',
            'uniformMatrix4fv'
        ]);
        expect(uniformCalls.every(call => call.location === location)).toBe(true);
    });
});

describe('createGLStub uniform-location identity', () => {
    it('returns the same location object for repeated lookups of the same name', () => {
        const { gl } = createGLStub();
        const program = gl.createProgram();

        const first = gl.getUniformLocation(program, 'u_time');
        const second = gl.getUniformLocation(program, 'u_time');

        expect(first).toBe(second);
    });

    it('returns different location objects for different names', () => {
        const { gl } = createGLStub();
        const program = gl.createProgram();

        const a = gl.getUniformLocation(program, 'u_a');
        const b = gl.getUniformLocation(program, 'u_b');

        expect(a).not.toBe(b);
    });
});

describe('createGLStub reset', () => {
    it('clears all recorded call logs but preserves gl identity', () => {
        const { gl, calls, texImage2DCalls, viewportCalls, useProgramCalls, uniformCalls, reset } = createGLStub();
        const program = gl.createProgram();
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.viewport(0, 0, 4, 4);
        gl.useProgram(program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_x'), 1);

        const glBefore = gl;
        reset();

        expect(calls).toHaveLength(0);
        expect(texImage2DCalls).toHaveLength(0);
        expect(viewportCalls).toHaveLength(0);
        expect(useProgramCalls).toHaveLength(0);
        expect(uniformCalls).toHaveLength(0);
        expect(gl).toBe(glBefore);
    });
});

describe('createGLStub overrides', () => {
    it('lets a consumer patch a single method without forking the stub', () => {
        const calls: number[] = [];
        const { gl } = createGLStub({
            overrides: {
                activeTexture: (texture: number): void => {
                    calls.push(texture);
                }
            }
        });

        gl.activeTexture(gl.TEXTURE0);

        expect(calls).toEqual([gl.TEXTURE0]);
    });
});

describe('createCanvasStub', () => {
    it('returns a canvas whose getContext resolves to the stubbed gl', () => {
        const { canvas, gl } = createCanvasStub();

        expect(canvas.getContext('webgl')).toBe(gl);
        expect(canvas.getContext('experimental-webgl')).toBe(gl);
        expect(canvas.getContext('2d')).toBeNull();
    });

    it('uses the configured canvas size', () => {
        const { canvas } = createCanvasStub({ canvas: { width: 640, height: 480 } });

        expect(canvas.width).toBe(640);
        expect(canvas.height).toBe(480);
    });
});
