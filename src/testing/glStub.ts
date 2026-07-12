import {
    GL_CLAMP_TO_EDGE,
    GL_FLOAT,
    GL_HALF_FLOAT_OES,
    GL_LINEAR,
    GL_NEAREST,
    GL_RGBA,
    GL_UNSIGNED_BYTE
} from '@/core/lib/glConstants';
import type { WebGLExtensionName } from '@/types';

const GL_ARRAY_BUFFER = 0x8892;
const GL_BYTE = 0x1400;
const GL_COLOR_ATTACHMENT0 = 0x8ce0;
const GL_COLOR_BUFFER_BIT = 0x4000;
const GL_COMPILE_STATUS = 0x8b81;
const GL_FRAGMENT_SHADER = 0x8b30;
const GL_FRAMEBUFFER = 0x8d40;
const GL_FRAMEBUFFER_BINDING = 0x8ca6;
const GL_FRAMEBUFFER_COMPLETE = 0x8cd5;
const GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8cd6;
const GL_IMPLEMENTATION_COLOR_READ_FORMAT = 0x8b9b;
const GL_IMPLEMENTATION_COLOR_READ_TYPE = 0x8b9a;
const GL_LINK_STATUS = 0x8b82;
const GL_MAX_TEXTURE_SIZE = 0x0d33;
const GL_SHORT = 0x1402;
const GL_STATIC_DRAW = 0x88e4;
const GL_TEXTURE_2D = 0x0de1;
const GL_TEXTURE_MAG_FILTER = 0x2800;
const GL_TEXTURE_MIN_FILTER = 0x2801;
const GL_TEXTURE_WRAP_S = 0x2802;
const GL_TEXTURE_WRAP_T = 0x2803;
const GL_TEXTURE0 = 0x84c0;
const GL_TRIANGLE_STRIP = 0x0005;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_VERTEX_SHADER = 0x8b31;
const GL_VIEWPORT = 0x0ba2;

const ENUM_CONSTANTS = {
    ARRAY_BUFFER: GL_ARRAY_BUFFER,
    BYTE: GL_BYTE,
    CLAMP_TO_EDGE: GL_CLAMP_TO_EDGE,
    COLOR_ATTACHMENT0: GL_COLOR_ATTACHMENT0,
    COLOR_BUFFER_BIT: GL_COLOR_BUFFER_BIT,
    COMPILE_STATUS: GL_COMPILE_STATUS,
    FLOAT: GL_FLOAT,
    FRAGMENT_SHADER: GL_FRAGMENT_SHADER,
    FRAMEBUFFER: GL_FRAMEBUFFER,
    FRAMEBUFFER_BINDING: GL_FRAMEBUFFER_BINDING,
    FRAMEBUFFER_COMPLETE: GL_FRAMEBUFFER_COMPLETE,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT,
    IMPLEMENTATION_COLOR_READ_FORMAT: GL_IMPLEMENTATION_COLOR_READ_FORMAT,
    IMPLEMENTATION_COLOR_READ_TYPE: GL_IMPLEMENTATION_COLOR_READ_TYPE,
    LINEAR: GL_LINEAR,
    LINK_STATUS: GL_LINK_STATUS,
    MAX_TEXTURE_SIZE: GL_MAX_TEXTURE_SIZE,
    NEAREST: GL_NEAREST,
    RGBA: GL_RGBA,
    SHORT: GL_SHORT,
    STATIC_DRAW: GL_STATIC_DRAW,
    TEXTURE_2D: GL_TEXTURE_2D,
    TEXTURE_MAG_FILTER: GL_TEXTURE_MAG_FILTER,
    TEXTURE_MIN_FILTER: GL_TEXTURE_MIN_FILTER,
    TEXTURE_WRAP_S: GL_TEXTURE_WRAP_S,
    TEXTURE_WRAP_T: GL_TEXTURE_WRAP_T,
    TEXTURE0: GL_TEXTURE0,
    TRIANGLE_STRIP: GL_TRIANGLE_STRIP,
    UNSIGNED_BYTE: GL_UNSIGNED_BYTE,
    UNSIGNED_SHORT: GL_UNSIGNED_SHORT,
    VERTEX_SHADER: GL_VERTEX_SHADER,
    VIEWPORT: GL_VIEWPORT
} as const;

const ENUM_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function isEnumLikeName(name: string): boolean {
    return ENUM_NAME_PATTERN.test(name);
}

function syntheticEnumValue(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    return 0x40000 + (Math.abs(hash) % 0x10000);
}

export interface GLCall {
    name: string;
    args: unknown[];
}

export interface TexImage2DCallRecord {
    internalFormat: number;
    width: number;
    height: number;
    format: number;
    type: number;
}

export interface UniformCallRecord {
    name: string;
    location: WebGLUniformLocation | null;
    value: unknown;
}

export interface ReadPixelsCallRecord {
    x: number;
    y: number;
    width: number;
    height: number;
    format: number;
    type: number;
}

export interface GLStubConfig {
    extensions?: Partial<Record<WebGLExtensionName, boolean>>;
    renderableTypes?: number[];
    canvas?: { width: number; height: number };
    compileFails?: boolean;
    linkFails?: boolean;
    missingAttributes?: string[];
    colorReadType?: number;
    colorReadFormat?: number;
    contextLost?: boolean;
    maxTextureSize?: number;
    overrides?: Partial<WebGLRenderingContext>;
}

export interface GLStubHandle {
    gl: WebGLRenderingContext;
    calls: readonly GLCall[];
    texImage2DCalls: readonly TexImage2DCallRecord[];
    viewportCalls: readonly [number, number, number, number][];
    useProgramCalls: readonly WebGLProgram[];
    uniformCalls: readonly UniformCallRecord[];
    readPixelsCalls: readonly ReadPixelsCallRecord[];
    reset: () => void;
    config: Readonly<GLStubConfig>;
}

export interface CanvasStubHandle extends GLStubHandle {
    canvas: HTMLCanvasElement;
}

const UNSTUBBED_METHOD_MESSAGE_SUFFIX =
    'This stub models capability probing, program/uniform/attribute accounting and ' +
    'framebuffer-completeness only — it does not emulate rendering. Provide an override or file an issue.';

export function createGLStub(config: GLStubConfig = {}): GLStubHandle {
    const resolvedConfig: Readonly<GLStubConfig> = { ...config };
    const canvasSize = config.canvas ?? { width: 300, height: 150 };
    const renderableTypes = new Set<number>(config.renderableTypes ?? [GL_UNSIGNED_BYTE]);
    const missingAttributes = new Set<string>(config.missingAttributes ?? []);
    const extensionFlags = (config.extensions ?? {}) as Record<string, boolean | undefined>;

    const calls: GLCall[] = [];
    const texImage2DCalls: TexImage2DCallRecord[] = [];
    const viewportCalls: [number, number, number, number][] = [];
    const useProgramCalls: WebGLProgram[] = [];
    const uniformCalls: UniformCallRecord[] = [];
    const readPixelsCalls: ReadPixelsCallRecord[] = [];

    const colorReadType = config.colorReadType ?? GL_UNSIGNED_BYTE;
    const colorReadFormat = config.colorReadFormat ?? GL_RGBA;

    let boundTexture: WebGLTexture | null = null;
    let boundFramebuffer: WebGLFramebuffer | null = null;
    let boundBuffer: WebGLBuffer | null = null;
    let currentProgram: WebGLProgram | null = null;
    let currentViewport: [number, number, number, number] = [0, 0, canvasSize.width, canvasSize.height];

    const textureTypes = new Map<WebGLTexture, number>();
    const fbAttachment = new Map<WebGLFramebuffer, WebGLTexture>();
    const uniformLocations = new Map<string, WebGLUniformLocation>();
    const attributeLocations = new Map<string, number>();
    let nextAttributeLocation = 0;

    const record = (name: string, args: unknown[]): void => {
        calls.push({ name, args });
    };

    const extensionObjects: Record<string, object> = {
        OES_texture_float: {},
        OES_texture_float_linear: {},
        OES_texture_half_float: { HALF_FLOAT_OES: GL_HALF_FLOAT_OES },
        OES_texture_half_float_linear: {},
        OES_vertex_array_object: {},
        ANGLE_instanced_arrays: {
            vertexAttribDivisorANGLE: (index: number, divisor: number): void => {
                record('vertexAttribDivisorANGLE', [index, divisor]);
            },
            drawArraysInstancedANGLE: (mode: number, first: number, count: number, primcount: number): void => {
                record('drawArraysInstancedANGLE', [mode, first, count, primcount]);
            }
        },
        WEBGL_lose_context: {
            loseContext: (): void => {
                record('loseContext', []);
            }
        }
    };

    const canvas = {
        width: canvasSize.width,
        height: canvasSize.height,
        style: { width: '', height: '' },
        getContext: (contextId: string): WebGLRenderingContext | null =>
            contextId === 'webgl' || contextId === 'experimental-webgl' ? gl : null
    };

    const recordUniform = (name: string, location: WebGLUniformLocation | null, value: unknown, args: unknown[]): void => {
        record(name, args);
        uniformCalls.push({ name, location, value });
    };

    const impl = {
        ...ENUM_CONSTANTS,
        canvas,
        isContextLost: (): boolean => {
            record('isContextLost', []);
            return config.contextLost ?? false;
        },
        getExtension: (name: string): object | null => {
            record('getExtension', [name]);
            if (!(extensionFlags[name] ?? false)) {
                return null;
            }
            return extensionObjects[name] ?? {};
        },
        createTexture: (): WebGLTexture => {
            record('createTexture', []);
            return {};
        },
        createFramebuffer: (): WebGLFramebuffer => {
            record('createFramebuffer', []);
            return {};
        },
        createBuffer: (): WebGLBuffer => {
            record('createBuffer', []);
            return {};
        },
        createProgram: (): WebGLProgram => {
            record('createProgram', []);
            return {};
        },
        createShader: (type: number): WebGLShader => {
            record('createShader', [type]);
            return {};
        },
        bindTexture: (target: number, texture: WebGLTexture | null): void => {
            record('bindTexture', [target, texture]);
            boundTexture = texture;
        },
        bindFramebuffer: (target: number, framebuffer: WebGLFramebuffer | null): void => {
            record('bindFramebuffer', [target, framebuffer]);
            boundFramebuffer = framebuffer;
        },
        bindBuffer: (target: number, buffer: WebGLBuffer | null): void => {
            record('bindBuffer', [target, buffer]);
            boundBuffer = buffer;
        },
        activeTexture: (texture: number): void => {
            record('activeTexture', [texture]);
        },
        texParameteri: (target: number, pname: number, param: number): void => {
            record('texParameteri', [target, pname, param]);
        },
        viewport: (x: number, y: number, width: number, height: number): void => {
            record('viewport', [x, y, width, height]);
            viewportCalls.push([x, y, width, height]);
            currentViewport = [x, y, width, height];
        },
        deleteTexture: (texture: WebGLTexture | null): void => {
            record('deleteTexture', [texture]);
            if (boundTexture === texture) {
                boundTexture = null;
            }
        },
        deleteFramebuffer: (framebuffer: WebGLFramebuffer | null): void => {
            record('deleteFramebuffer', [framebuffer]);
            if (boundFramebuffer === framebuffer) {
                boundFramebuffer = null;
            }
        },
        deleteBuffer: (buffer: WebGLBuffer | null): void => {
            record('deleteBuffer', [buffer]);
            if (boundBuffer === buffer) {
                boundBuffer = null;
            }
        },
        deleteProgram: (program: WebGLProgram | null): void => {
            record('deleteProgram', [program]);
            if (currentProgram === program) {
                currentProgram = null;
            }
        },
        deleteShader: (shader: WebGLShader | null): void => {
            record('deleteShader', [shader]);
        },
        texImage2D: (
            target: number,
            level: number,
            internalFormat: number,
            width: number,
            height: number,
            border: number,
            format: number,
            type: number,
            pixels: ArrayBufferView | null
        ): void => {
            record('texImage2D', [target, level, internalFormat, width, height, border, format, type, pixels]);
            if (boundTexture) {
                textureTypes.set(boundTexture, type);
            }
            texImage2DCalls.push({ internalFormat, width, height, format, type });
        },
        framebufferTexture2D: (
            fbTarget: number,
            attachment: number,
            texTarget: number,
            texture: WebGLTexture,
            level: number
        ): void => {
            record('framebufferTexture2D', [fbTarget, attachment, texTarget, texture, level]);
            if (boundFramebuffer) {
                fbAttachment.set(boundFramebuffer, texture);
            }
        },
        checkFramebufferStatus: (target: number): number => {
            record('checkFramebufferStatus', [target]);
            const texture = boundFramebuffer ? fbAttachment.get(boundFramebuffer) : undefined;
            const type = texture ? textureTypes.get(texture) : undefined;
            return type !== undefined && renderableTypes.has(type)
                ? GL_FRAMEBUFFER_COMPLETE
                : GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
        },
        shaderSource: (shader: WebGLShader, source: string): void => {
            record('shaderSource', [shader, source]);
        },
        compileShader: (shader: WebGLShader): void => {
            record('compileShader', [shader]);
        },
        attachShader: (program: WebGLProgram, shader: WebGLShader): void => {
            record('attachShader', [program, shader]);
        },
        linkProgram: (program: WebGLProgram): void => {
            record('linkProgram', [program]);
        },
        getShaderParameter: (shader: WebGLShader, pname: number): boolean => {
            record('getShaderParameter', [shader, pname]);
            return pname === GL_COMPILE_STATUS ? !config.compileFails : true;
        },
        getProgramParameter: (program: WebGLProgram, pname: number): boolean => {
            record('getProgramParameter', [program, pname]);
            return pname === GL_LINK_STATUS ? !config.linkFails : true;
        },
        getShaderInfoLog: (shader: WebGLShader): string => {
            record('getShaderInfoLog', [shader]);
            return config.compileFails ? 'micugl test stub: simulated shader compile failure' : '';
        },
        getProgramInfoLog: (program: WebGLProgram): string => {
            record('getProgramInfoLog', [program]);
            return config.linkFails ? 'micugl test stub: simulated program link failure' : '';
        },
        getUniformLocation: (program: WebGLProgram, name: string): WebGLUniformLocation => {
            record('getUniformLocation', [program, name]);
            let location = uniformLocations.get(name);
            if (!location) {
                location = {};
                uniformLocations.set(name, location);
            }
            return location;
        },
        getAttribLocation: (program: WebGLProgram, name: string): number => {
            record('getAttribLocation', [program, name]);
            if (missingAttributes.has(name)) {
                return -1;
            }
            let location = attributeLocations.get(name);
            if (location === undefined) {
                location = nextAttributeLocation;
                nextAttributeLocation += 1;
                attributeLocations.set(name, location);
            }
            return location;
        },
        useProgram: (program: WebGLProgram | null): void => {
            record('useProgram', [program]);
            currentProgram = program;
            if (program) {
                useProgramCalls.push(program);
            }
        },
        clearColor: (red: number, green: number, blue: number, alpha: number): void => {
            record('clearColor', [red, green, blue, alpha]);
        },
        clear: (mask: number): void => {
            record('clear', [mask]);
        },
        bufferData: (target: number, data: ArrayBufferView, usage: number): void => {
            record('bufferData', [target, data, usage]);
        },
        bufferSubData: (target: number, offset: number, data: ArrayBufferView): void => {
            record('bufferSubData', [target, offset, data]);
        },
        drawArrays: (mode: number, first: number, count: number): void => {
            record('drawArrays', [mode, first, count]);
        },
        drawElements: (mode: number, count: number, type: number, offset: number): void => {
            record('drawElements', [mode, count, type, offset]);
        },
        enableVertexAttribArray: (index: number): void => {
            record('enableVertexAttribArray', [index]);
        },
        vertexAttribPointer: (
            index: number,
            size: number,
            type: number,
            normalized: boolean,
            stride: number,
            offset: number
        ): void => {
            record('vertexAttribPointer', [index, size, type, normalized, stride, offset]);
        },
        vertexAttribDivisor: (index: number, divisor: number): void => {
            record('vertexAttribDivisor', [index, divisor]);
        },
        uniform1f: (location: WebGLUniformLocation | null, value: number): void => {
            recordUniform('uniform1f', location, value, [location, value]);
        },
        uniform1i: (location: WebGLUniformLocation | null, value: number): void => {
            recordUniform('uniform1i', location, value, [location, value]);
        },
        uniform2fv: (location: WebGLUniformLocation | null, value: Float32Array | number[]): void => {
            recordUniform('uniform2fv', location, value, [location, value]);
        },
        uniform3fv: (location: WebGLUniformLocation | null, value: Float32Array | number[]): void => {
            recordUniform('uniform3fv', location, value, [location, value]);
        },
        uniform4fv: (location: WebGLUniformLocation | null, value: Float32Array | number[]): void => {
            recordUniform('uniform4fv', location, value, [location, value]);
        },
        uniformMatrix2fv: (location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void => {
            recordUniform('uniformMatrix2fv', location, value, [location, transpose, value]);
        },
        uniformMatrix3fv: (location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void => {
            recordUniform('uniformMatrix3fv', location, value, [location, transpose, value]);
        },
        uniformMatrix4fv: (location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void => {
            recordUniform('uniformMatrix4fv', location, value, [location, transpose, value]);
        },
        readPixels: (
            x: number,
            y: number,
            width: number,
            height: number,
            format: number,
            type: number,
            pixels: ArrayBufferView | null
        ): void => {
            record('readPixels', [x, y, width, height, format, type, pixels]);
            readPixelsCalls.push({ x, y, width, height, format, type });
            if (pixels && typeof (pixels as unknown as { fill?: unknown }).fill === 'function') {
                (pixels as unknown as { fill: (value: number) => void }).fill(0);
            }
        },
        getParameter: (pname: number): unknown => {
            record('getParameter', [pname]);
            if (pname === GL_FRAMEBUFFER_BINDING) {
                return boundFramebuffer;
            }
            if (pname === GL_VIEWPORT) {
                return currentViewport;
            }
            if (pname === GL_IMPLEMENTATION_COLOR_READ_TYPE) {
                return colorReadType;
            }
            if (pname === GL_IMPLEMENTATION_COLOR_READ_FORMAT) {
                return colorReadFormat;
            }
            if (pname === GL_MAX_TEXTURE_SIZE) {
                return config.maxTextureSize ?? 4096;
            }
            throw new Error(
                `micugl test stub: unstubbed getParameter pname ${pname}. ${UNSTUBBED_METHOD_MESSAGE_SUFFIX}`
            );
        }
    };

    if (config.overrides) {
        Object.assign(impl, config.overrides);
    }

    const handler: ProxyHandler<typeof impl> = {
        get(obj, prop, receiver): unknown {
            if (typeof prop === 'symbol') {
                return Reflect.get(obj, prop, receiver);
            }
            if (prop in obj) {
                return Reflect.get(obj, prop, receiver);
            }
            if (isEnumLikeName(prop)) {
                return syntheticEnumValue(prop);
            }
            if (prop === 'then') {
                return undefined;
            }
            return (): never => {
                throw new Error(
                    `micugl test stub: unstubbed GL call gl.${prop}(...). ${UNSTUBBED_METHOD_MESSAGE_SUFFIX}`
                );
            };
        }
    };

    const gl = new Proxy(impl, handler) as unknown as WebGLRenderingContext;

    return {
        gl,
        calls,
        texImage2DCalls,
        viewportCalls,
        useProgramCalls,
        uniformCalls,
        readPixelsCalls,
        reset: (): void => {
            calls.length = 0;
            texImage2DCalls.length = 0;
            viewportCalls.length = 0;
            useProgramCalls.length = 0;
            uniformCalls.length = 0;
            readPixelsCalls.length = 0;
        },
        config: resolvedConfig
    };
}

export function createCanvasStub(config: GLStubConfig = {}): CanvasStubHandle {
    const handle = createGLStub(config);
    const canvas = handle.gl.canvas as unknown as HTMLCanvasElement;
    return { canvas, ...handle };
}
