import type { MainToWorker, WorkerToMain } from '@/worker/protocol';
import { WorkerRuntime } from '@/worker/WorkerRuntime';

export interface WorkerGlobalScopeLike {
    postMessage: (message: WorkerToMain) => void;
    addEventListener: (
        type: 'message',
        listener: (event: { data: MainToWorker }) => void
    ) => void;
    requestAnimationFrame: (callback: (now: number) => void) => number;
    cancelAnimationFrame: (handle: number) => void;
    close: () => void;
}

export function startWorkerRuntime(scope: WorkerGlobalScopeLike): WorkerRuntime {
    const runtime = new WorkerRuntime({
        postMessage: message => { scope.postMessage(message) },
        requestAnimationFrame: callback => scope.requestAnimationFrame(callback),
        cancelAnimationFrame: handle => { scope.cancelAnimationFrame(handle) },
        now: () => performance.now(),
        close: () => { scope.close() }
    });

    scope.addEventListener('message', event => { runtime.handleMessage(event.data) });

    return runtime;
}

startWorkerRuntime(globalThis as unknown as WorkerGlobalScopeLike);
