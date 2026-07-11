import { describe, expect, it } from 'vitest';

import { GL_FLOAT, GL_HALF_FLOAT_OES, GL_LINEAR, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { FBOManager } from '@/core/managers/FBOManager';

interface TexImage2DCall {
    internalFormat: number;
    width: number;
    height: number;
    format: number;
    type: number;
}

interface StubConfig {
    floatExt?: boolean;
    halfFloatExt?: boolean;
    floatLinearExt?: boolean;
    halfFloatLinearExt?: boolean;
    renderableTypes?: number[];
}

interface GLStub {
    gl: WebGLRenderingContext;
    texImage2DCalls: TexImage2DCall[];
    viewportCalls: number[][];
}

const ENUM = {
    FLOAT: GL_FLOAT,
    UNSIGNED_BYTE: GL_UNSIGNED_BYTE,
    RGBA: 0x1908,
    TEXTURE_2D: 0x0de1,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: GL_LINEAR,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE0: 0x84c0
};

function createGLStub(config: StubConfig = {}): GLStub {
    const renderable = new Set<number>(config.renderableTypes ?? [GL_UNSIGNED_BYTE]);
    const textureTypes = new Map<WebGLTexture, number>();
    const fbAttachment = new Map<WebGLFramebuffer, WebGLTexture>();
    const texImage2DCalls: TexImage2DCall[] = [];
    const viewportCalls: number[][] = [];

    let boundTexture: WebGLTexture | null = null;
    let boundFramebuffer: WebGLFramebuffer | null = null;

    const getExtension = (name: string): object | null => {
        switch (name) {
            case 'OES_texture_float':
                return config.floatExt ? {} : null;
            case 'OES_texture_half_float':
                return config.halfFloatExt ? { HALF_FLOAT_OES: GL_HALF_FLOAT_OES } : null;
            case 'OES_texture_float_linear':
                return config.floatLinearExt ? {} : null;
            case 'OES_texture_half_float_linear':
                return config.halfFloatLinearExt ? {} : null;
            default:
                return null;
        }
    };

    const stub = {
        ...ENUM,
        canvas: { width: 300, height: 150 },
        getExtension,
        createTexture: (): WebGLTexture => ({}),
        createFramebuffer: (): WebGLFramebuffer => ({}),
        bindTexture: (_target: number, texture: WebGLTexture | null): void => { boundTexture = texture },
        bindFramebuffer: (_target: number, fb: WebGLFramebuffer | null): void => { boundFramebuffer = fb },
        activeTexture: (): void => undefined,
        texParameteri: (): void => undefined,
        viewport: (x: number, y: number, width: number, height: number): void => {
            viewportCalls.push([x, y, width, height]);
        },
        deleteTexture: (): void => undefined,
        deleteFramebuffer: (): void => undefined,
        texImage2D: (
            _target: number, _level: number, internalFormat: number,
            width: number, height: number, _border: number,
            format: number, type: number
        ): void => {
            if (boundTexture) {
                textureTypes.set(boundTexture, type);
            }
            texImage2DCalls.push({ internalFormat, width, height, format, type });
        },
        framebufferTexture2D: (
            _target: number, _attachment: number, _textarget: number, texture: WebGLTexture
        ): void => {
            if (boundFramebuffer) {
                fbAttachment.set(boundFramebuffer, texture);
            }
        },
        checkFramebufferStatus: (): number => {
            const texture = boundFramebuffer ? fbAttachment.get(boundFramebuffer) : undefined;
            const type = texture ? textureTypes.get(texture) : undefined;
            return type !== undefined && renderable.has(type)
                ? ENUM.FRAMEBUFFER_COMPLETE
                : ENUM.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
        }
    };

    return { gl: stub as unknown as WebGLRenderingContext, texImage2DCalls, viewportCalls };
}

describe('FBOManager capability resolution', () => {
    it('creates a FLOAT framebuffer when float is renderable', () => {
        const { gl, texImage2DCalls } = createGLStub({
            floatExt: true,
            floatLinearExt: true,
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        texImage2DCalls.length = 0;
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
            floatExt: true,
            floatLinearExt: false,
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
        const { gl, texImage2DCalls } = createGLStub({
            floatExt: true,
            renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
        });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('post', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        texImage2DCalls.length = 0;
        manager.resizeFramebuffer('post', 8, 8);

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 8, height: 8, type: GL_UNSIGNED_BYTE });
    });

    it('resizes every texture in the ping-pong set', () => {
        const { gl, texImage2DCalls } = createGLStub();
        const manager = new FBOManager(gl);

        manager.createFramebuffer('feedback', {
            width: 4,
            height: 4,
            textureCount: 2,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        texImage2DCalls.length = 0;
        manager.resizeFramebuffer('feedback', 16, 16);

        expect(texImage2DCalls).toHaveLength(2);
        expect(texImage2DCalls.every(call => call.width === 16 && call.height === 16)).toBe(true);
    });
});

describe('FBOManager destroy and recreate', () => {
    it('uses fresh texture options after destroy and recreate of the same id', () => {
        const { gl, texImage2DCalls } = createGLStub({
            floatExt: true,
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

        texImage2DCalls.length = 0;
        manager.resizeFramebuffer('x', 8, 8);

        expect(texImage2DCalls[0].type).toBe(GL_UNSIGNED_BYTE);
    });
});

describe('FBOManager viewport cache', () => {
    it('applies the framebuffer viewport on bind, skips redundant binds, and restores canvas size', () => {
        const { gl, viewportCalls } = createGLStub({ renderableTypes: [GL_UNSIGNED_BYTE] });
        const manager = new FBOManager(gl);

        manager.createFramebuffer('a', {
            width: 4,
            height: 4,
            textureCount: 1,
            textureOptions: { type: GL_UNSIGNED_BYTE }
        });

        viewportCalls.length = 0;

        manager.bindFramebuffer('a');
        manager.bindFramebuffer('a');
        manager.bindFramebuffer(null);

        expect(viewportCalls).toEqual([[0, 0, 4, 4], [0, 0, 300, 150]]);
    });
});
