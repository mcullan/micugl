import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
    installFrameSampler,
    installGlCounters,
    installInstrumentation,
    instrumentationInitScript
} from '@/testing/glCounters';

const GL_RGBA = 6408;
const GL_UNSIGNED_BYTE = 5121;

type FakeGlMethod = (...args: unknown[]) => unknown;

interface FakeWindow {
    WebGLRenderingContext: { prototype: Record<PropertyKey, unknown> };
    HTMLCanvasElement: { prototype: Record<PropertyKey, unknown> };
    requestAnimationFrame: (callback: (timestamp: number) => void) => number;
    cancelAnimationFrame: (id: number) => void;
}

const WRAPPED_GL_METHODS = [
    'compileShader',
    'linkProgram',
    'texImage2D',
    'framebufferTexture2D',
    'checkFramebufferStatus',
    'useProgram',
    'uniform1f',
    'uniform1i',
    'uniform2fv',
    'uniform3fv',
    'uniform4fv',
    'uniformMatrix2fv',
    'uniformMatrix3fv',
    'uniformMatrix4fv',
    'drawArrays',
    'drawElements',
    'bufferData'
];

const createFakeWindow = (): { fakeWindow: FakeWindow; fireFrame: (timestamp: number) => void } => {
    const glProto: Record<PropertyKey, unknown> = {};
    for (const name of WRAPPED_GL_METHODS) {
        glProto[name] = (): string => `${name}:original`;
    }

    const canvasProto: Record<PropertyKey, unknown> = {
        getContext: (contextId: string): unknown => ({ contextId })
    };

    let nextRafId = 1;
    let pendingId: number | null = null;
    let pendingCallback: ((timestamp: number) => void) | null = null;

    const fakeWindow: FakeWindow = {
        WebGLRenderingContext: { prototype: glProto },
        HTMLCanvasElement: { prototype: canvasProto },
        requestAnimationFrame: callback => {
            const id = nextRafId;
            nextRafId += 1;
            pendingId = id;
            pendingCallback = callback;
            return id;
        },
        cancelAnimationFrame: id => {
            if (pendingId === id) {
                pendingId = null;
                pendingCallback = null;
            }
        }
    };

    const fireFrame = (timestamp: number): void => {
        const callback = pendingCallback;
        pendingCallback = null;
        pendingId = null;
        callback?.(timestamp);
    };

    return { fakeWindow, fireFrame };
};

const asTarget = (fakeWindow: FakeWindow): Window & typeof globalThis =>
    fakeWindow as unknown as Window & typeof globalThis;

describe('installInstrumentation counting', () => {
    it('counts wrapped GL calls, preserves original return values, and estimates texture/buffer bytes', () => {
        const { fakeWindow } = createFakeWindow();
        const handle = installInstrumentation(asTarget(fakeWindow));
        const glProto = fakeWindow.WebGLRenderingContext.prototype as Record<string, FakeGlMethod>;

        expect(glProto.compileShader()).toBe('compileShader:original');
        expect(glProto.linkProgram()).toBe('linkProgram:original');
        glProto.texImage2D(0, 0, GL_RGBA, 4, 4, 0, GL_RGBA, GL_UNSIGNED_BYTE, null);
        glProto.framebufferTexture2D();
        glProto.checkFramebufferStatus();
        glProto.useProgram();
        glProto.uniform1f();
        glProto.uniform1i();
        glProto.uniform2fv();
        glProto.uniform3fv();
        glProto.uniform4fv();
        glProto.uniformMatrix2fv();
        glProto.uniformMatrix3fv();
        glProto.uniformMatrix4fv();
        glProto.drawArrays();
        glProto.drawElements();
        glProto.bufferData(0, 128, 0);

        expect(handle.counters.snapshot()).toEqual({
            contextsCreated: 0,
            compileShader: 1,
            linkProgram: 1,
            texImage2D: 1,
            textureBytes: 64,
            framebufferTexture2D: 1,
            checkFramebufferStatus: 1,
            useProgram: 1,
            uniformCalls: 8,
            drawArrays: 1,
            drawElements: 1,
            bufferData: 1,
            bufferBytes: 128
        });
    });

    it('counts contextsCreated only for webgl/experimental-webgl getContext calls', () => {
        const { fakeWindow } = createFakeWindow();
        const handle = installInstrumentation(asTarget(fakeWindow));
        const canvasProto = fakeWindow.HTMLCanvasElement.prototype as Record<string, FakeGlMethod>;

        canvasProto.getContext('webgl');
        canvasProto.getContext('experimental-webgl');
        canvasProto.getContext('2d');

        expect(handle.counters.snapshot().contextsCreated).toBe(2);
    });

    it('reset() zeroes all counters', () => {
        const { fakeWindow } = createFakeWindow();
        const handle = installInstrumentation(asTarget(fakeWindow));
        const glProto = fakeWindow.WebGLRenderingContext.prototype as Record<string, FakeGlMethod>;

        glProto.compileShader();
        glProto.drawArrays();
        expect(handle.counters.snapshot().compileShader).toBe(1);

        handle.counters.reset();

        expect(handle.counters.snapshot()).toEqual({
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
        });
    });
});

describe('installInstrumentation idempotency', () => {
    it('returns the same handle on a second install and does not double-count', () => {
        const { fakeWindow } = createFakeWindow();
        const target = asTarget(fakeWindow);

        const first = installInstrumentation(target);
        const second = installInstrumentation(target);

        expect(second).toBe(first);

        const glProto = fakeWindow.WebGLRenderingContext.prototype as Record<string, FakeGlMethod>;
        glProto.compileShader();

        expect(first.counters.snapshot().compileShader).toBe(1);
    });

    it('stamps the idempotency symbol on the wrapped prototype', () => {
        const { fakeWindow } = createFakeWindow();
        installInstrumentation(asTarget(fakeWindow));

        const flag = (fakeWindow.WebGLRenderingContext.prototype as Record<symbol, unknown>)[Symbol.for('micugl.instrumented')];
        expect(flag).toBe(true);
    });

    it('stashes the handle and back-compat aliases on the target', () => {
        const { fakeWindow } = createFakeWindow();
        const target = asTarget(fakeWindow);
        const handle = installInstrumentation(target);

        expect(target.__micuglInstrumentation).toBe(handle);
        expect(target.__glCounters).toBe(handle.counters);
        expect(target.__frameSampler).toBe(handle.frameSampler);
    });
});

describe('installGlCounters / installFrameSampler', () => {
    it('installGlCounters returns the counters handle from installInstrumentation', () => {
        const { fakeWindow } = createFakeWindow();
        const target = asTarget(fakeWindow);

        const counters = installGlCounters(target);

        expect(counters).toBe(target.__micuglInstrumentation.counters);
    });

    it('installFrameSampler returns the frameSampler handle from installInstrumentation', () => {
        const { fakeWindow } = createFakeWindow();
        const target = asTarget(fakeWindow);

        const frameSampler = installFrameSampler(target);

        expect(frameSampler).toBe(target.__micuglInstrumentation.frameSampler);
    });
});

describe('frameSampler', () => {
    it('computes count/mean/p50/p95 from sampled frame deltas', () => {
        const { fakeWindow, fireFrame } = createFakeWindow();
        const handle = installInstrumentation(asTarget(fakeWindow));

        handle.frameSampler.start();
        fireFrame(16);
        fireFrame(32);
        fireFrame(48);
        const stats = handle.frameSampler.stop();

        expect(stats).toEqual({ count: 2, mean: 16, p50: 16, p95: 16 });
    });

    it('returns zeroed stats when no frames were sampled', () => {
        const { fakeWindow } = createFakeWindow();
        const handle = installInstrumentation(asTarget(fakeWindow));

        expect(handle.frameSampler.stop()).toEqual({ count: 0, mean: 0, p50: 0, p95: 0 });
    });
});

describe('instrumentationInitScript self-containment', () => {
    it('installs without a ReferenceError when evaluated in an isolated vm context', () => {
        const { fakeWindow } = createFakeWindow();
        const sandbox = { window: fakeWindow };

        expect(() => { runInNewContext(instrumentationInitScript, sandbox) }).not.toThrow();

        const installed = (fakeWindow as unknown as { __micuglInstrumentation?: unknown }).__micuglInstrumentation;
        expect(installed).toBeDefined();
    });
});
