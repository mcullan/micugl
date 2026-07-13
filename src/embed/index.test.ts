import { afterEach, describe, expect, it, vi } from 'vitest';

import { embed } from '@/embed';

const GL_VERTEX_SHADER = 0x8b31;
const GL_FRAGMENT_SHADER = 0x8b30;
const GL_COMPILE_STATUS = 0x8b81;
const GL_LINK_STATUS = 0x8b82;
const GL_ARRAY_BUFFER = 0x8892;
const GL_STATIC_DRAW = 0x88e4;
const GL_FLOAT = 0x1406;
const GL_COLOR_BUFFER_BIT = 0x4000;
const GL_TRIANGLE_STRIP = 0x0005;

interface GLCall {
    name: string;
    args: unknown[];
}

interface GLStubOptions {
    noContext?: boolean;
    compileFails?: boolean;
    linkFails?: boolean;
    nullUniforms?: string[];
    drawingBufferWidth?: number;
    drawingBufferHeight?: number;
}

interface GLStubHandle {
    canvas: HTMLCanvasElement;
    calls: GLCall[];
    contextAttributes: WebGLContextAttributes[];
    locationFor: (name: string) => object | null;
    named: (name: string) => GLCall[];
    countOf: (name: string) => number;
    fireContextLost: () => void;
    contextLostListenerCount: () => number;
}

function createStub(options: GLStubOptions = {}): GLStubHandle {
    const calls: GLCall[] = [];
    const contextAttributes: WebGLContextAttributes[] = [];
    const nullUniforms = new Set(options.nullUniforms ?? []);
    const locations = new Map<string, object>();
    const contextLostListeners = new Set<() => void>();

    const record = (name: string, args: unknown[]): void => {
        calls.push({ name, args });
    };

    const locationFor = (name: string): object | null => {
        if (nullUniforms.has(name)) {
            return null;
        }
        let location = locations.get(name);
        if (!location) {
            location = { uniform: name };
            locations.set(name, location);
        }
        return location;
    };

    const gl = {
        VERTEX_SHADER: GL_VERTEX_SHADER,
        FRAGMENT_SHADER: GL_FRAGMENT_SHADER,
        COMPILE_STATUS: GL_COMPILE_STATUS,
        LINK_STATUS: GL_LINK_STATUS,
        ARRAY_BUFFER: GL_ARRAY_BUFFER,
        STATIC_DRAW: GL_STATIC_DRAW,
        FLOAT: GL_FLOAT,
        COLOR_BUFFER_BIT: GL_COLOR_BUFFER_BIT,
        TRIANGLE_STRIP: GL_TRIANGLE_STRIP,
        get drawingBufferWidth(): number {
            return options.drawingBufferWidth ?? canvas.width;
        },
        get drawingBufferHeight(): number {
            return options.drawingBufferHeight ?? canvas.height;
        },
        createShader: (type: number): object => {
            record('createShader', [type]);
            return { shader: type };
        },
        shaderSource: (shader: object, source: string): void => { record('shaderSource', [shader, source]) },
        compileShader: (shader: object): void => { record('compileShader', [shader]) },
        getShaderParameter: (shader: object, pname: number): boolean => {
            record('getShaderParameter', [shader, pname]);
            return !(options.compileFails ?? false);
        },
        getShaderInfoLog: (shader: object): string => {
            record('getShaderInfoLog', [shader]);
            return 'ERROR: 0:3 undefined variable';
        },
        deleteShader: (shader: object): void => { record('deleteShader', [shader]) },
        createProgram: (): object => {
            record('createProgram', []);
            return { program: true };
        },
        attachShader: (program: object, shader: object): void => { record('attachShader', [program, shader]) },
        linkProgram: (program: object): void => { record('linkProgram', [program]) },
        getProgramParameter: (program: object, pname: number): boolean => {
            record('getProgramParameter', [program, pname]);
            return !(options.linkFails ?? false);
        },
        getProgramInfoLog: (program: object): string => {
            record('getProgramInfoLog', [program]);
            return 'ERROR: varying v_uv is not written';
        },
        useProgram: (program: object): void => { record('useProgram', [program]) },
        deleteProgram: (program: object): void => { record('deleteProgram', [program]) },
        createBuffer: (): object => {
            record('createBuffer', []);
            return { buffer: true };
        },
        bindBuffer: (target: number, buffer: object): void => { record('bindBuffer', [target, buffer]) },
        bufferData: (target: number, data: Float32Array, usage: number): void => {
            record('bufferData', [target, data, usage]);
        },
        deleteBuffer: (buffer: object): void => { record('deleteBuffer', [buffer]) },
        getAttribLocation: (program: object, name: string): number => {
            record('getAttribLocation', [program, name]);
            return 0;
        },
        enableVertexAttribArray: (index: number): void => { record('enableVertexAttribArray', [index]) },
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
        getUniformLocation: (program: object, name: string): object | null => {
            record('getUniformLocation', [program, name]);
            return locationFor(name);
        },
        uniform1f: (location: object, value: number): void => { record('uniform1f', [location, value]) },
        uniform2f: (location: object, x: number, y: number): void => { record('uniform2f', [location, x, y]) },
        uniform2fv: (location: object, value: Float32Array): void => { record('uniform2fv', [location, value]) },
        uniform3fv: (location: object, value: Float32Array): void => { record('uniform3fv', [location, value]) },
        uniform4fv: (location: object, value: Float32Array): void => { record('uniform4fv', [location, value]) },
        clearColor: (r: number, g: number, b: number, a: number): void => { record('clearColor', [r, g, b, a]) },
        clear: (mask: number): void => { record('clear', [mask]) },
        viewport: (x: number, y: number, width: number, height: number): void => {
            record('viewport', [x, y, width, height]);
        },
        drawArrays: (mode: number, first: number, count: number): void => {
            record('drawArrays', [mode, first, count]);
        },
        getExtension: (name: string): object | null => {
            record('getExtension', [name]);
            if (name !== 'WEBGL_lose_context') {
                return null;
            }
            return {
                loseContext: (): void => { record('loseContext', []) }
            };
        }
    };

    const canvas = {
        width: 300,
        height: 150,
        style: { width: '', height: '' },
        getContext: (contextId: string, attributes: WebGLContextAttributes): unknown => {
            record('getContext', [contextId, attributes]);
            contextAttributes.push(attributes);
            return (options.noContext ?? false) ? null : gl;
        },
        addEventListener: (type: string, listener: () => void): void => {
            if (type === 'webglcontextlost') {
                contextLostListeners.add(listener);
            }
        },
        removeEventListener: (type: string, listener: () => void): void => {
            if (type === 'webglcontextlost') {
                contextLostListeners.delete(listener);
            }
        }
    };

    const named = (name: string): GLCall[] => calls.filter(call => call.name === name);

    return {
        canvas: canvas as unknown as HTMLCanvasElement,
        calls,
        contextAttributes,
        locationFor,
        named,
        countOf: (name: string): number => named(name).length,
        fireContextLost: (): void => {
            for (const listener of [...contextLostListeners]) {
                listener();
            }
        },
        contextLostListenerCount: (): number => contextLostListeners.size
    };
}

interface EnvironmentOptions {
    reducedMotion?: boolean;
    saveData?: boolean;
    devicePixelRatio?: number;
    innerWidth?: number;
    innerHeight?: number;
    noMatchMedia?: boolean;
}

interface WindowStub {
    devicePixelRatio: number;
    innerWidth: number;
    innerHeight: number;
    matchMedia?: (query: string) => { matches: boolean };
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
}

interface EnvironmentHandle {
    tick: (deltaMs?: number) => void;
    fireResize: () => void;
    resizeListenerCount: () => number;
    setViewport: (width: number, height: number) => void;
}

function installEnvironment(options: EnvironmentOptions = {}): EnvironmentHandle {
    const frames = new Map<number, FrameRequestCallback>();
    const resizeListeners = new Set<() => void>();
    let nextFrameId = 1;
    let now = 1000;

    const win: WindowStub = {
        devicePixelRatio: options.devicePixelRatio ?? 1,
        innerWidth: options.innerWidth ?? 800,
        innerHeight: options.innerHeight ?? 600,
        matchMedia: (query: string): { matches: boolean } => ({
            matches: query === '(prefers-reduced-motion: reduce)' && (options.reducedMotion ?? false)
        }),
        addEventListener: (type: string, listener: () => void): void => {
            if (type === 'resize') {
                resizeListeners.add(listener);
            }
        },
        removeEventListener: (type: string, listener: () => void): void => {
            if (type === 'resize') {
                resizeListeners.delete(listener);
            }
        }
    };

    if (options.noMatchMedia ?? false) {
        delete win.matchMedia;
    }

    vi.stubGlobal('window', win);
    vi.stubGlobal('navigator', { connection: { saveData: options.saveData ?? false } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
        const id = nextFrameId;
        nextFrameId += 1;
        frames.set(id, callback);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
        frames.delete(id);
    });

    return {
        tick: (deltaMs = 16): void => {
            now += deltaMs;
            const pending = [...frames.values()];
            frames.clear();
            for (const callback of pending) {
                callback(now);
            }
        },
        fireResize: (): void => {
            for (const listener of [...resizeListeners]) {
                listener();
            }
        },
        resizeListenerCount: (): number => resizeListeners.size,
        setViewport: (width: number, height: number): void => {
            win.innerWidth = width;
            win.innerHeight = height;
        }
    };
}

const FRAGMENT = 'precision highp float;void main(){gl_FragColor=vec4(1.0);}';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
});

describe('embed fail-loud paths', () => {
    it('throws when the canvas yields no WebGL context', () => {
        installEnvironment();
        const { canvas } = createStub({ noContext: true });

        expect(() => embed(canvas, { fragment: FRAGMENT }))
            .toThrow(/^micugl\/embed: could not get a WebGL context/);
    });

    it('throws with the shader info log when compilation fails', () => {
        installEnvironment();
        const { canvas } = createStub({ compileFails: true });

        expect(() => embed(canvas, { fragment: FRAGMENT }))
            .toThrow(/^micugl\/embed: shader compilation failed: ERROR: 0:3 undefined variable/);
    });

    it('throws with the program info log when linking fails', () => {
        installEnvironment();
        const { canvas } = createStub({ linkFails: true });

        expect(() => embed(canvas, { fragment: FRAGMENT }))
            .toThrow(/^micugl\/embed: program link failed: ERROR: varying v_uv is not written/);
    });

    it('deletes the program and both shaders before throwing on a link failure', () => {
        installEnvironment();
        const stub = createStub({ linkFails: true });

        expect(() => embed(stub.canvas, { fragment: FRAGMENT })).toThrow();

        expect(stub.countOf('deleteShader')).toBe(2);
        expect(stub.countOf('deleteProgram')).toBe(1);
    });

    it('throws for a uniform array that is not 2 to 4 components', () => {
        installEnvironment();

        expect(() => embed(createStub().canvas, { fragment: FRAGMENT, uniforms: { u_a: [1] } }))
            .toThrow(/^micugl\/embed: uniform "u_a" must be a finite number or an array of 2 to 4 finite numbers/);
        expect(() => embed(createStub().canvas, { fragment: FRAGMENT, uniforms: { u_a: [1, 2, 3, 4, 5] } }))
            .toThrow(/received 1,2,3,4,5$/);
    });

    it('throws for a uniform that is neither a number nor an array', () => {
        installEnvironment();
        const uniforms = { u_a: 'red' } as unknown as Record<string, number>;

        expect(() => embed(createStub().canvas, { fragment: FRAGMENT, uniforms }))
            .toThrow(/^micugl\/embed: uniform "u_a" must be a finite number or an array of 2 to 4 finite numbers/);
    });

    it('throws for a non-finite uniform value rather than uploading NaN', () => {
        installEnvironment();

        expect(() => embed(createStub().canvas, { fragment: FRAGMENT, uniforms: { u_a: Number.NaN } }))
            .toThrow(/^micugl\/embed: uniform "u_a" must be a finite number/);
        expect(() => embed(createStub().canvas, { fragment: FRAGMENT, uniforms: { u_a: [1, Number.NaN] } }))
            .toThrow(/received 1,NaN$/);
    });
});

describe('embed setup', () => {
    it('compiles one vertex and one fragment shader into a single linked program', () => {
        installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT });

        expect(stub.named('createShader').map(call => call.args[0])).toEqual([
            GL_VERTEX_SHADER,
            GL_FRAGMENT_SHADER
        ]);
        expect(stub.countOf('createProgram')).toBe(1);
        expect(stub.countOf('linkProgram')).toBe(1);
        expect(stub.countOf('useProgram')).toBe(1);

        const sources = stub.named('shaderSource').map(call => call.args[1]);
        expect(sources[0]).toContain('attribute vec2 a_position');
        expect(sources[1]).toBe(FRAGMENT);
    });

    it('uploads the fullscreen quad and binds a_position as a 2-component float attribute', () => {
        installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT });

        const bufferData = stub.named('bufferData')[0];
        expect(bufferData.args[0]).toBe(GL_ARRAY_BUFFER);
        expect(bufferData.args[1]).toEqual(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
        expect(bufferData.args[2]).toBe(GL_STATIC_DRAW);

        expect(stub.named('getAttribLocation')[0]?.args[1]).toBe('a_position');
        expect(stub.named('enableVertexAttribArray')[0]?.args).toEqual([0]);
        expect(stub.named('vertexAttribPointer')[0]?.args).toEqual([0, 2, GL_FLOAT, false, 0, 0]);
    });

    it('merges caller context attributes over the low-power defaults', () => {
        installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT, contextAttributes: { alpha: true } });

        expect(stub.contextAttributes[0]).toEqual({
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'low-power'
        });
    });

    it('sets the clear color once at init rather than every frame', () => {
        const environment = installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT, clearColor: [0.1, 0.2, 0.3, 1] });
        environment.tick();
        environment.tick();

        expect(stub.named('clearColor')).toHaveLength(1);
        expect(stub.named('clearColor')[0]?.args).toEqual([0.1, 0.2, 0.3, 1]);
    });

    it('sizes the css box to the viewport', () => {
        installEnvironment({ devicePixelRatio: 3, innerWidth: 800, innerHeight: 600 });
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT });

        expect(stub.canvas.style.width).toBe('800px');
        expect(stub.canvas.style.height).toBe('600px');
    });
});

describe('embed dpr', () => {
    it('reads a numeric dpr as a fixed ratio, exactly as the React dpr prop does', () => {
        installEnvironment({ devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 });
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT, dpr: 2 });

        expect(stub.canvas.width).toBe(1600);
        expect(stub.canvas.height).toBe(1200);
    });

    it('clamps devicePixelRatio into the range when dpr is a tuple', () => {
        installEnvironment({ devicePixelRatio: 3, innerWidth: 800, innerHeight: 600 });
        const capped = createStub();

        embed(capped.canvas, { fragment: FRAGMENT, dpr: [1, 1.5] });

        expect(capped.canvas.width).toBe(1200);
        expect(capped.canvas.height).toBe(900);

        installEnvironment({ devicePixelRatio: 0.5, innerWidth: 800, innerHeight: 600 });
        const floored = createStub();

        embed(floored.canvas, { fragment: FRAGMENT, dpr: [1, 1.5] });

        expect(floored.canvas.width).toBe(800);
        expect(floored.canvas.height).toBe(600);
    });

    it('defaults to the React [1, 2] range: capped above 2x, floored below 1x', () => {
        installEnvironment({ devicePixelRatio: 3, innerWidth: 800, innerHeight: 600 });
        const dense = createStub();

        embed(dense.canvas, { fragment: FRAGMENT });

        expect(dense.canvas.width).toBe(1600);
        expect(dense.canvas.height).toBe(1200);

        installEnvironment({ devicePixelRatio: 0.5, innerWidth: 800, innerHeight: 600 });
        const zoomedOut = createStub();

        embed(zoomedOut.canvas, { fragment: FRAGMENT });

        expect(zoomedOut.canvas.width).toBe(800);
        expect(zoomedOut.canvas.height).toBe(600);
    });
});

describe('embed viewport', () => {
    it('sets the viewport from the real drawing buffer, not the requested canvas size', () => {
        const environment = installEnvironment({ devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 });
        const stub = createStub({ drawingBufferWidth: 1024, drawingBufferHeight: 768 });

        embed(stub.canvas, { fragment: FRAGMENT });

        expect(stub.canvas.width).toBe(1600);
        expect(stub.canvas.height).toBe(1200);
        expect(stub.named('viewport').at(-1)?.args).toEqual([0, 0, 1024, 768]);

        environment.tick();

        expect(stub.named('uniform2f').at(-1)?.args).toEqual([stub.locationFor('u_resolution'), 1024, 768]);
    });

    it('keeps the viewport on the real drawing buffer across a resize', () => {
        const environment = installEnvironment({ devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 });
        const stub = createStub({ drawingBufferWidth: 1024, drawingBufferHeight: 768 });

        embed(stub.canvas, { fragment: FRAGMENT });
        environment.setViewport(1200, 900);
        environment.fireResize();

        expect(stub.canvas.width).toBe(2400);
        expect(stub.named('viewport').at(-1)?.args).toEqual([0, 0, 1024, 768]);
    });
});

describe('embed uniform dispatch', () => {
    it('dispatches caller uniforms by shape and uploads the values', () => {
        installEnvironment();
        const stub = createStub();

        embed(stub.canvas, {
            fragment: FRAGMENT,
            uniforms: {
                u_scalar: 0.5,
                u_vec2: [1, 2],
                u_vec3: [1, 2, 3],
                u_vec4: [1, 2, 3, 4]
            }
        });

        const scalar = stub.named('uniform1f').find(call => call.args[0] === stub.locationFor('u_scalar'));
        expect(scalar?.args[1]).toBe(0.5);

        expect(stub.named('uniform2fv')[0]?.args).toEqual([
            stub.locationFor('u_vec2'),
            new Float32Array([1, 2])
        ]);
        expect(stub.named('uniform3fv')[0]?.args).toEqual([
            stub.locationFor('u_vec3'),
            new Float32Array([1, 2, 3])
        ]);
        expect(stub.named('uniform4fv')[0]?.args).toEqual([
            stub.locationFor('u_vec4'),
            new Float32Array([1, 2, 3, 4])
        ]);
    });

    it('skips a uniform whose location is null while still uploading every other uniform', () => {
        installEnvironment();
        const stub = createStub({ nullUniforms: ['u_unused'] });

        embed(stub.canvas, {
            fragment: FRAGMENT,
            uniforms: { u_unused: [1, 2], u_used: [3, 4] }
        });

        const uploads = stub.named('uniform2fv');
        expect(uploads).toHaveLength(1);
        expect(uploads[0]?.args[0]).toBe(stub.locationFor('u_used'));
        expect(uploads[0]?.args[1]).toEqual(new Float32Array([3, 4]));
        expect(uploads.some(call => call.args[0] === null)).toBe(false);
    });

    it('still validates a uniform that the shader optimized away', () => {
        installEnvironment();

        expect(() => embed(
            createStub({ nullUniforms: ['u_unused'] }).canvas,
            { fragment: FRAGMENT, uniforms: { u_unused: [1] } }
        )).toThrow(/^micugl\/embed: uniform "u_unused" must be a finite number or an array of 2 to 4/);

        expect(() => embed(
            createStub({ nullUniforms: ['u_unused'] }).canvas,
            { fragment: FRAGMENT, uniforms: { u_unused: Number.NaN } }
        )).toThrow(/^micugl\/embed: uniform "u_unused" must be a finite number/);

        const typo = { u_unused: 'red' } as unknown as Record<string, number>;
        expect(() => embed(
            createStub({ nullUniforms: ['u_unused'] }).canvas,
            { fragment: FRAGMENT, uniforms: typo }
        )).toThrow(/^micugl\/embed: uniform "u_unused" must be a finite number/);
    });

    it('skips the upload, without throwing, for a valid value the shader optimized away', () => {
        installEnvironment();
        const stub = createStub({ nullUniforms: ['u_unused', 'u_scalar'] });

        expect(() => embed(stub.canvas, {
            fragment: FRAGMENT,
            uniforms: { u_unused: [1, 2], u_scalar: 0.5 }
        })).not.toThrow();

        expect(stub.countOf('uniform2fv')).toBe(0);
        expect(stub.countOf('uniform1f')).toBe(0);
    });
});

describe('embed render loop', () => {
    it('advances u_time across successive frames', () => {
        const environment = installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT });

        environment.tick(500);
        environment.tick(500);
        environment.tick(1000);

        const timeLocation = stub.locationFor('u_time');
        const times = stub.named('uniform1f')
            .filter(call => call.args[0] === timeLocation)
            .map(call => call.args[1] as number);

        expect(times).toEqual([0, 0.5, 1.5]);
    });

    it('draws the quad and uploads the drawing-buffer resolution on every frame', () => {
        const environment = installEnvironment({ devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 });
        const stub = createStub({ drawingBufferWidth: 1024, drawingBufferHeight: 768 });

        embed(stub.canvas, { fragment: FRAGMENT });

        environment.tick();
        environment.tick();

        expect(stub.countOf('clear')).toBe(2);
        expect(stub.countOf('drawArrays')).toBe(2);
        expect(stub.named('drawArrays')[0]?.args).toEqual([GL_TRIANGLE_STRIP, 0, 4]);
        expect(stub.named('uniform2f')).toHaveLength(2);
        expect(stub.named('uniform2f')[0]?.args).toEqual([stub.locationFor('u_resolution'), 1024, 768]);
    });

    it('uploads no time when the shader declares no u_time', () => {
        const environment = installEnvironment();
        const stub = createStub({ nullUniforms: ['u_time'] });

        embed(stub.canvas, { fragment: FRAGMENT });

        environment.tick();
        environment.tick();

        expect(stub.countOf('uniform1f')).toBe(0);
        expect(stub.countOf('drawArrays')).toBe(2);
    });

    it('re-sizes the drawing buffer when the window resizes', () => {
        const environment = installEnvironment({ innerWidth: 800, innerHeight: 600 });
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT });
        environment.setViewport(1024, 768);
        environment.fireResize();

        expect(stub.canvas.width).toBe(1024);
        expect(stub.canvas.height).toBe(768);
        expect(stub.named('viewport').at(-1)?.args).toEqual([0, 0, 1024, 768]);
    });
});

describe('embed destroy', () => {
    it('stops the render loop so no further draw is issued', () => {
        const environment = installEnvironment();
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        environment.tick();
        expect(stub.countOf('drawArrays')).toBe(2);

        handle.destroy();
        environment.tick();
        environment.tick();

        expect(stub.countOf('drawArrays')).toBe(2);
    });

    it('removes the resize listener so a later resize touches no GL state', () => {
        const environment = installEnvironment();
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        expect(environment.resizeListenerCount()).toBe(1);

        handle.destroy();
        const viewportCalls = stub.countOf('viewport');
        environment.setViewport(1024, 768);
        environment.fireResize();

        expect(environment.resizeListenerCount()).toBe(0);
        expect(stub.countOf('viewport')).toBe(viewportCalls);
    });

    it('deletes every GL resource and releases the context', () => {
        installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT }).destroy();

        expect(stub.countOf('deleteProgram')).toBe(1);
        expect(stub.countOf('deleteShader')).toBe(2);
        expect(stub.countOf('deleteBuffer')).toBe(1);
        expect(stub.named('getExtension').at(-1)?.args).toEqual(['WEBGL_lose_context']);
        expect(stub.countOf('loseContext')).toBe(1);
    });

    it('stops the loop when destroyed before the first frame runs', () => {
        const environment = installEnvironment();
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT }).destroy();
        environment.tick();
        environment.tick();

        expect(stub.countOf('drawArrays')).toBe(0);
    });

    it('is idempotent: a second destroy neither throws nor restarts the loop', () => {
        const environment = installEnvironment();
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        handle.destroy();

        expect(() => { handle.destroy() }).not.toThrow();

        environment.tick();
        environment.tick();

        expect(stub.countOf('drawArrays')).toBe(1);
        expect(handle.animating).toBe(false);
    });

    it('reports animating false once destroyed, and stops drawing', () => {
        const environment = installEnvironment();
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        expect(handle.animating).toBe(true);
        expect(stub.countOf('drawArrays')).toBe(1);

        handle.destroy();
        environment.tick();

        expect(handle.animating).toBe(false);
        expect(stub.countOf('drawArrays')).toBe(1);
    });
});

describe('embed context loss', () => {
    it('logs loudly when the WebGL context is lost rather than going silently blank', () => {
        const environment = installEnvironment();
        const stub = createStub();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        stub.fireContextLost();

        expect(errors).toHaveBeenCalledTimes(1);
        expect(errors.mock.calls[0]?.[0]).toMatch(/^micugl\/embed: the WebGL context was lost/);
    });

    it('does not log a lost context that destroy() caused itself', () => {
        installEnvironment();
        const stub = createStub();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        embed(stub.canvas, { fragment: FRAGMENT }).destroy();
        stub.fireContextLost();

        expect(stub.contextLostListenerCount()).toBe(0);
        expect(errors).not.toHaveBeenCalled();
    });
});

describe('embed motion gate', () => {
    it('animates when the user expresses no preference', () => {
        const environment = installEnvironment();
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(true);
        expect(stub.countOf('drawArrays')).toBe(2);
    });

    it('renders a single static frame when prefers-reduced-motion is set', () => {
        const environment = installEnvironment({ reducedMotion: true });
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(false);
        expect(stub.countOf('drawArrays')).toBe(1);
        expect(stub.named('uniform1f')[0]?.args).toEqual([stub.locationFor('u_time'), 0]);
    });

    it('poses the static frame on the same 60fps timebase as the React staticFrame prop', () => {
        installEnvironment({ reducedMotion: true });
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT, staticFrame: 90 });

        expect(stub.named('uniform1f')[0]?.args).toEqual([stub.locationFor('u_time'), 1.5]);
    });

    it('keeps the static frame painted across a resize', () => {
        const environment = installEnvironment({ reducedMotion: true });
        const stub = createStub();

        embed(stub.canvas, { fragment: FRAGMENT, staticFrame: 60 });
        environment.setViewport(1024, 768);
        environment.fireResize();

        expect(stub.countOf('drawArrays')).toBe(2);
        expect(stub.named('uniform1f').at(-1)?.args).toEqual([stub.locationFor('u_time'), 1]);
    });

    it('animates against prefers-reduced-motion only when the caller opts out', () => {
        const environment = installEnvironment({ reducedMotion: true });
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT, reducedMotion: 'ignore' });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(true);
        expect(stub.countOf('drawArrays')).toBe(2);
    });

    it('renders a single static frame when the connection asks to save data', () => {
        const environment = installEnvironment({ saveData: true });
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(false);
        expect(stub.countOf('drawArrays')).toBe(1);
    });

    it('animates against save-data only when the caller opts out', () => {
        const environment = installEnvironment({ saveData: true });
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT, saveData: 'ignore' });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(true);
        expect(stub.countOf('drawArrays')).toBe(2);
    });

    it('folds pause into a static frame rather than animating', () => {
        const environment = installEnvironment({ reducedMotion: true, saveData: true });
        const stub = createStub();

        const handle = embed(stub.canvas, {
            fragment: FRAGMENT,
            reducedMotion: 'pause',
            saveData: 'pause',
            staticFrame: 30
        });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(false);
        expect(stub.countOf('drawArrays')).toBe(1);
        expect(stub.named('uniform1f')[0]?.args).toEqual([stub.locationFor('u_time'), 0.5]);
    });

    it('gates on an unknown policy string rather than animating against the preference', () => {
        const environment = installEnvironment({ reducedMotion: true });
        const stub = createStub();
        const options = {
            fragment: FRAGMENT,
            reducedMotion: 'static_frame'
        } as unknown as { fragment: string };

        const handle = embed(stub.canvas, options);
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(false);
        expect(stub.countOf('drawArrays')).toBe(1);
    });

    it('animates without throwing in a DOM shim that has no matchMedia', () => {
        const environment = installEnvironment({ noMatchMedia: true });
        const stub = createStub();

        const handle = embed(stub.canvas, { fragment: FRAGMENT });
        environment.tick();
        environment.tick();

        expect(handle.animating).toBe(true);
        expect(stub.countOf('drawArrays')).toBe(2);
    });
});

describe('embed module scope', () => {
    it('imports without touching a browser global', async () => {
        vi.unstubAllGlobals();
        vi.resetModules();

        expect(globalThis.window as unknown).toBeUndefined();

        const module = await import('@/embed');

        expect(typeof module.embed).toBe('function');
    });
});
