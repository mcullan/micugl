export interface GlCountersData {
    contextsCreated: number;
    compileShader: number;
    linkProgram: number;
    texImage2D: number;
    textureBytes: number;
    framebufferTexture2D: number;
    checkFramebufferStatus: number;
    useProgram: number;
    uniformCalls: number;
    drawArrays: number;
    drawElements: number;
    bufferData: number;
    bufferBytes: number;
}

export interface GlCountersHandle {
    reset: () => void;
    snapshot: () => GlCountersData;
}

export interface FrameStats {
    count: number;
    mean: number;
    p50: number;
    p95: number;
}

export interface FrameSamplerHandle {
    start: () => void;
    stop: () => FrameStats;
}

export interface InstrumentationHandle {
    counters: GlCountersHandle;
    frameSampler: FrameSamplerHandle;
}

declare global {
    interface Window {
        __micuglInstrumentation: InstrumentationHandle;
        __glCounters: GlCountersHandle;
        __frameSampler: FrameSamplerHandle;
    }
}

export function installInstrumentation(target: Window & typeof globalThis = window): InstrumentationHandle {
    const instrumentedSymbol = Symbol.for('micugl.instrumented');
    const prototypeFlags = target.WebGLRenderingContext.prototype as unknown as Record<symbol, boolean | undefined>;

    if (prototypeFlags[instrumentedSymbol] === true) {
        const existing = (target as unknown as { __micuglInstrumentation?: InstrumentationHandle }).__micuglInstrumentation;
        if (existing) {
            return existing;
        }
        throw new Error('micugl: WebGLRenderingContext.prototype is already instrumented but target.__micuglInstrumentation is missing');
    }

    type GlProtoMethod = (this: WebGLRenderingContext, ...args: unknown[]) => unknown;

    const data: GlCountersData = {
        contextsCreated: 0,
        compileShader: 0,
        linkProgram: 0,
        texImage2D: 0,
        textureBytes: 0,
        framebufferTexture2D: 0,
        checkFramebufferStatus: 0,
        useProgram: 0,
        uniformCalls: 0,
        drawArrays: 0,
        drawElements: 0,
        bufferData: 0,
        bufferBytes: 0
    };

    const componentsForFormat = (format: number): number => {
        switch (format) {
            case 6408: return 4;
            case 6407: return 3;
            case 6410: return 2;
            case 6409: return 1;
            case 6406: return 1;
            case 6402: return 1;
            default: return 4;
        }
    };

    const bytesPerComponent = (type: number): number => {
        switch (type) {
            case 5121: return 1;
            case 5123: return 2;
            case 5125: return 4;
            case 5126: return 4;
            case 36193: return 2;
            case 5131: return 2;
            default: return 1;
        }
    };

    const bytesPerTexel = (format: number, type: number): number => {
        if (type === 33635 || type === 32819 || type === 32820) {
            return 2;
        }
        return componentsForFormat(format) * bytesPerComponent(type);
    };

    const estimateTextureBytes = (args: unknown[]): number => {
        const width = args[3];
        const height = args[4];
        const format = args[6];
        const type = args[7];
        if (
            typeof width !== 'number'
            || typeof height !== 'number'
            || typeof format !== 'number'
            || typeof type !== 'number'
        ) {
            return 0;
        }
        return width * height * bytesPerTexel(format, type);
    };

    const estimateBufferBytes = (args: unknown[]): number => {
        const value = args[1];
        if (typeof value === 'number') {
            return value;
        }
        if (value !== null && typeof value === 'object' && 'byteLength' in value) {
            const byteLength = (value as { byteLength: unknown }).byteLength;
            if (typeof byteLength === 'number') {
                return byteLength;
            }
        }
        return 0;
    };

    const glProto = target.WebGLRenderingContext.prototype as unknown as Record<string, GlProtoMethod | undefined>;

    const wrap = (name: string, onCall: (args: unknown[]) => void): void => {
        const original = glProto[name];
        if (original === undefined) {
            throw new Error(`missing WebGLRenderingContext method: ${name}`);
        }
        glProto[name] = function (this: WebGLRenderingContext, ...args: unknown[]): unknown {
            onCall(args);
            return original.apply(this, args);
        };
    };

    wrap('compileShader', () => { data.compileShader += 1 });
    wrap('linkProgram', () => { data.linkProgram += 1 });
    wrap('texImage2D', args => {
        data.texImage2D += 1;
        data.textureBytes += estimateTextureBytes(args);
    });
    wrap('framebufferTexture2D', () => { data.framebufferTexture2D += 1 });
    wrap('checkFramebufferStatus', () => { data.checkFramebufferStatus += 1 });
    wrap('useProgram', () => { data.useProgram += 1 });
    for (const name of ['uniform1f', 'uniform1i', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv']) {
        wrap(name, () => { data.uniformCalls += 1 });
    }
    wrap('drawArrays', () => { data.drawArrays += 1 });
    wrap('drawElements', () => { data.drawElements += 1 });
    wrap('bufferData', args => {
        data.bufferData += 1;
        data.bufferBytes += estimateBufferBytes(args);
    });

    prototypeFlags[instrumentedSymbol] = true;

    type GetContextMethod = (
        this: HTMLCanvasElement,
        contextId: string,
        options?: unknown
    ) => RenderingContext | null;

    const canvasProto = target.HTMLCanvasElement.prototype as unknown as Record<string, GetContextMethod | undefined>;
    const originalGetContext = canvasProto.getContext;
    if (originalGetContext === undefined) {
        throw new Error('missing HTMLCanvasElement.getContext');
    }
    canvasProto.getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        options?: unknown
    ): RenderingContext | null {
        const context = originalGetContext.call(this, contextId, options);
        if (context !== null && (contextId === 'webgl' || contextId === 'experimental-webgl')) {
            data.contextsCreated += 1;
        }
        return context;
    };

    const counters: GlCountersHandle = {
        reset: () => {
            data.compileShader = 0;
            data.linkProgram = 0;
            data.texImage2D = 0;
            data.textureBytes = 0;
            data.framebufferTexture2D = 0;
            data.checkFramebufferStatus = 0;
            data.useProgram = 0;
            data.uniformCalls = 0;
            data.drawArrays = 0;
            data.drawElements = 0;
            data.bufferData = 0;
            data.bufferBytes = 0;
        },
        snapshot: () => ({ ...data })
    };

    const frameDeltas: number[] = [];
    let sampling = false;
    let lastTimestamp = 0;
    let rafId = 0;

    const onFrame = (timestamp: number): void => {
        if (!sampling) {
            return;
        }
        if (lastTimestamp !== 0) {
            frameDeltas.push(timestamp - lastTimestamp);
        }
        lastTimestamp = timestamp;
        rafId = target.requestAnimationFrame(onFrame);
    };

    const percentile = (sorted: number[], p: number): number => {
        if (sorted.length === 0) {
            return 0;
        }
        const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return sorted.find((_, valueIndex) => valueIndex === index) ?? 0;
    };

    const computeStats = (deltas: number[]): FrameStats => {
        const count = deltas.length;
        if (count === 0) {
            return { count: 0, mean: 0, p50: 0, p95: 0 };
        }
        const sum = deltas.reduce((total, delta) => total + delta, 0);
        const sorted = [...deltas].sort((a, b) => a - b);
        return {
            count,
            mean: sum / count,
            p50: percentile(sorted, 50),
            p95: percentile(sorted, 95)
        };
    };

    const frameSampler: FrameSamplerHandle = {
        start: () => {
            frameDeltas.length = 0;
            lastTimestamp = 0;
            sampling = true;
            rafId = target.requestAnimationFrame(onFrame);
        },
        stop: () => {
            sampling = false;
            target.cancelAnimationFrame(rafId);
            return computeStats(frameDeltas);
        }
    };

    const handle: InstrumentationHandle = { counters, frameSampler };

    target.__micuglInstrumentation = handle;
    target.__glCounters = counters;
    target.__frameSampler = frameSampler;

    return handle;
}

export function installGlCounters(target: Window & typeof globalThis = window): GlCountersHandle {
    return installInstrumentation(target).counters;
}

export function installFrameSampler(target: Window & typeof globalThis = window): FrameSamplerHandle {
    return installInstrumentation(target).frameSampler;
}

export const instrumentationInitScript = '(' + installInstrumentation.toString() + ')(window);';
