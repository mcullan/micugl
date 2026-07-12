import { describe, expect, it } from 'vitest';

import { GL_FLOAT, GL_LINEAR, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { FBOManager } from '@/core/managers/FBOManager';
import { createGLStub } from '@/testing';

describe('FBOManager capability resolution', () => {
    it('creates a FLOAT framebuffer when float is renderable', () => {
        const { gl, texImage2DCalls, reset } = createGLStub({
            extensions: { OES_texture_float: true, OES_texture_float_linear: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        reset();
        manager.createFramebuffer('sim', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_FLOAT, minFilter: GL_LINEAR, magFilter: GL_LINEAR }
        });

        expect(manager.isFloatTexturesSupported()).toBe(true);
        expect(texImage2DCalls[0].type).toBe(GL_FLOAT);
        expect(manager.wasFloatFilterDowngraded()).toBe(false);
    });

    it('throws instead of silently using UNSIGNED_BYTE when float is unavailable', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);

        expect(() => manager.createFramebuffer('sim', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_FLOAT }
        })).toThrow(/Refusing to fall back to UNSIGNED_BYTE/);
    });

    it('records a filter downgrade when float is renderable but not filterable', () => {
        const { gl } = createGLStub({
            extensions: { OES_texture_float: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('sim', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_FLOAT, minFilter: GL_LINEAR, magFilter: GL_LINEAR }
        });

        expect(manager.wasFloatFilterDowngraded()).toBe(true);
    });
});

describe('FBOManager resizeFramebuffer', () => {
    it('reuses the creation texture type on resize instead of flipping to FLOAT', () => {
        const { gl, texImage2DCalls, reset } = createGLStub({
            extensions: { OES_texture_float: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('post', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        reset();
        manager.resizeFramebuffer('post', 8, 8);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 8, height: 8, type: GL_UNSIGNED_BYTE });
    });

    it('resizes every texture in the ping-pong set', () => {
        const { gl, texImage2DCalls, reset } = createGLStub();
        const manager = new FBOManager(gl);

        manager.createFramebuffer('feedback', {
            width: 4,
            height: 4,
            textureCount: 2,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        reset();
        manager.resizeFramebuffer('feedback', 16, 16);

        expect(texImage2DCalls).toHaveLength(2);
        expect(texImage2DCalls.every(call => call.width === 16 && call.height === 16)).toBe(true);
    });
});

describe('FBOManager destroy and recreate', () => {
    it('uses fresh texture options after destroy and recreate of the same id', () => {
        const { gl, texImage2DCalls, reset } = createGLStub({
            extensions: { OES_texture_float: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('x', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_FLOAT }
        });

        manager.destroy('x');

        manager.createFramebuffer('x', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        reset();
        manager.resizeFramebuffer('x', 8, 8);

        expect(texImage2DCalls[0].type).toBe(GL_UNSIGNED_BYTE);
    });
});

describe('FBOManager viewport cache', () => {
    it('applies the framebuffer viewport on bind, skips redundant binds, and restores canvas size', () => {
        const { gl, viewportCalls, reset } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('a', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        reset();

        manager.bindFramebuffer('a');
        manager.bindFramebuffer('a');
        manager.bindFramebuffer(null);

        expect(viewportCalls).toEqual([[0, 0, 4, 4], [0, 0, 300, 150]]);
    });
});

describe('FBOManager debugReadFramebuffer', () => {
    it('throws for an unknown id', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);

        expect(() => manager.debugReadFramebuffer('missing')).toThrow(/not found/);
    });

    it('reads a zeroed pixel buffer for a normal UNSIGNED_BYTE framebuffer', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', { width: 4, height: 4, textureCount: 1 });

        const result = manager.debugReadFramebuffer('a');

        if ('unreadable' in result) {
            throw new Error(`expected a readable result, got: ${result.unreadable}`);
        }
        expect(result.width).toBe(4);
        expect(result.height).toBe(4);
        expect(result.pixels).toHaveLength(4 * 4 * 4);
        expect(result.pixels.every(value => value === 0)).toBe(true);
    });

    it('returns unreadable for a zero-size framebuffer', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', { width: 0, height: 0, textureCount: 1 });

        const result = manager.debugReadFramebuffer('a');

        expect(result).toEqual({ unreadable: 'framebuffer has zero size' });
    });

    it('returns unreadable when the framebuffer exceeds maxSize', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', { width: 16, height: 16, textureCount: 1 });

        const result = manager.debugReadFramebuffer('a', 8);

        expect('unreadable' in result).toBe(true);
    });

    it('returns unreadable when the framebuffer becomes incomplete at read time', () => {
        let calls = 0;
        const { gl } = createGLStub({
            renderableTypes: [GL_UNSIGNED_BYTE],
            overrides: {
                checkFramebufferStatus: (): number => {
                    calls += 1;
                    return calls === 1 ? gl.FRAMEBUFFER_COMPLETE : gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
                }
            }
        });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', { width: 4, height: 4, textureCount: 1 });

        const result = manager.debugReadFramebuffer('a');

        expect('unreadable' in result).toBe(true);
    });

    it('returns unreadable for a FLOAT framebuffer when the implementation cannot read UNSIGNED_BYTE', () => {
        const { gl } = createGLStub({
            extensions: { OES_texture_float: true },
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT],
            colorReadType: GL_FLOAT
        });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_FLOAT }
        });

        const result = manager.debugReadFramebuffer('a');

        expect(result).toEqual({ unreadable: 'float framebuffer readback unsupported' });
    });

    it('restores the previous framebuffer binding and viewport after reading', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);
        manager.createFramebuffer('a', { width: 4, height: 4, textureCount: 1 });
        manager.createFramebuffer('b', { width: 8, height: 8, textureCount: 1 });

        manager.bindFramebuffer('b');

        const boundBefore = gl.getParameter(gl.FRAMEBUFFER_BINDING) as unknown;
        const viewportBefore = gl.getParameter(gl.VIEWPORT) as unknown;

        manager.debugReadFramebuffer('a');

        expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(boundBefore);
        expect(gl.getParameter(gl.VIEWPORT)).toEqual(viewportBefore);
    });
});

describe('FBOManager getFramebufferIds', () => {
    it('lists created framebuffer ids and reflects destroy', () => {
        const { gl } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);

        expect(manager.getFramebufferIds()).toEqual([]);

        manager.createFramebuffer('a', { width: 4, height: 4, textureCount: 1 });
        manager.createFramebuffer('b', { width: 4, height: 4, textureCount: 1 });

        expect(manager.getFramebufferIds().sort()).toEqual(['a', 'b']);

        manager.destroy('a');

        expect(manager.getFramebufferIds()).toEqual(['b']);
    });
});
