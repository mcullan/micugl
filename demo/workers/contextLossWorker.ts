import type { MainToWorker, WorkerToMain } from '../../src/worker/protocol';
import { WorkerRuntime } from '../../src/worker/WorkerRuntime';

export type ContextLossMessage = { type: 'demo:losecontext' } | { type: 'demo:restorecontext' };

interface WorkerScope {
    postMessage: (message: WorkerToMain) => void;
    addEventListener: (
        type: 'message',
        listener: (event: { data: MainToWorker | ContextLossMessage }) => void
    ) => void;
    requestAnimationFrame: (callback: (now: number) => void) => number;
    cancelAnimationFrame: (handle: number) => void;
    close: () => void;
}

type ContextGetter = (contextId: string, options?: unknown) => unknown;

const scope = globalThis as unknown as WorkerScope;

let capturedExtension: WEBGL_lose_context | null = null;

const canvasPrototype = OffscreenCanvas.prototype as unknown as { getContext: ContextGetter };
const originalGetContext = canvasPrototype.getContext;

canvasPrototype.getContext = function (this: OffscreenCanvas, contextId: string, options?: unknown): unknown {
    const context = originalGetContext.call(this, contextId, options);
    if (context !== null && (contextId === 'webgl' || contextId === 'experimental-webgl')) {
        capturedExtension = (context as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    }
    return context;
};

const runtime = new WorkerRuntime({
    postMessage: message => { scope.postMessage(message) },
    requestAnimationFrame: callback => scope.requestAnimationFrame(callback),
    cancelAnimationFrame: handle => { scope.cancelAnimationFrame(handle) },
    now: () => performance.now(),
    close: () => { scope.close() }
});

const loseContextExtension = (): WEBGL_lose_context => {
    if (!capturedExtension) {
        throw new Error(
            'demo worker: no WEBGL_lose_context extension was captured, so this worker has either not created '
            + 'its WebGL context yet or the extension is unavailable'
        );
    }
    return capturedExtension;
};

scope.addEventListener('message', event => {
    const message = event.data;

    if (message.type === 'demo:losecontext') {
        loseContextExtension().loseContext();
        return;
    }
    if (message.type === 'demo:restorecontext') {
        loseContextExtension().restoreContext();
        return;
    }

    runtime.handleMessage(message);
});
