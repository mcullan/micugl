export interface WorkerSupportScope {
    OffscreenCanvas?: unknown;
    Worker?: unknown;
    HTMLCanvasElement?: { prototype: object };
}

export interface CreateWorkerOptions {
    createWorker?: () => Worker;
    scope?: WorkerSupportScope;
    log?: (message: string) => void;
}

export type InlineWorkerConstructor = new () => Worker;

export interface WorkerFactoryDeps {
    loadInlineWorker: () => Promise<unknown>;
    log: (message: string) => void;
}

const ESCAPE_HATCHES =
    'Either pass createWorker={() => new Worker(new URL(\'micugl/worker\', import.meta.url), '
    + '{ type: \'module\' })} to build the worker yourself, or turn worker mode off.';

const MAIN_THREAD_FALLBACK =
    'Rendering on the main thread instead: the picture is identical, only the threading benefit is lost.';

function errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createOnceLogger(sink: (message: string) => void): (message: string) => void {
    const seen = new Set<string>();
    return message => {
        if (seen.has(message)) {
            return;
        }
        seen.add(message);
        sink(message);
    };
}

export function isWorkerModeSupported(scope: WorkerSupportScope): boolean {
    if (scope.OffscreenCanvas === undefined || scope.Worker === undefined) {
        return false;
    }

    const canvasClass = scope.HTMLCanvasElement;
    if (!canvasClass) {
        return false;
    }

    return 'transferControlToOffscreen' in canvasClass.prototype;
}

export function unsupportedMessage(): string {
    return 'micugl worker: this environment has no OffscreenCanvas / '
        + 'HTMLCanvasElement.transferControlToOffscreen / Worker, so the render loop cannot move off the main '
        + `thread. ${MAIN_THREAD_FALLBACK}`;
}

export function blobWorkerFailedMessage(error: unknown): string {
    return `micugl worker: constructing the render worker failed (${errorDetail(error)}). The usual cause is a `
        + 'Content-Security-Policy that forbids blob: workers. Remedy: add "worker-src \'self\' blob:" to your '
        + `CSP. ${ESCAPE_HATCHES} ${MAIN_THREAD_FALLBACK}`;
}

export function overrideWorkerFailedMessage(error: unknown): string {
    return `micugl worker: the createWorker() factory you passed threw (${errorDetail(error)}), so there is no `
        + 'render worker to drive the canvas. micugl did not build this worker and cannot fix it: make the '
        + 'factory return a worker your page is allowed to load, for example a same-origin worker URL such as '
        + 'new Worker(new URL(\'micugl/worker\', import.meta.url), { type: \'module\' }) served from your own '
        + `origin, with "worker-src 'self'" in your CSP. ${MAIN_THREAD_FALLBACK}`;
}

export function inlineWorkerNeverStartedMessage(): string {
    return 'micugl worker: the render worker was constructed but its script never started, so it can never '
        + 'drive the canvas. The usual cause is a Content-Security-Policy that forbids blob: workers: Chromium '
        + 'blocks such a worker asynchronously rather than throwing from the Worker constructor. Remedy: add '
        + `"worker-src 'self' blob:" to your CSP. ${ESCAPE_HATCHES} ${MAIN_THREAD_FALLBACK}`;
}

export function overrideWorkerNeverStartedMessage(): string {
    return 'micugl worker: the worker returned by the createWorker() factory you passed never started its '
        + 'script, so it can never drive the canvas. micugl did not build this worker and cannot fix it: make '
        + 'the factory return a worker your page is allowed to load and that resolves to a real script, for '
        + 'example new Worker(new URL(\'micugl/worker\', import.meta.url), { type: \'module\' }) served from '
        + `your own origin, with "worker-src 'self'" in your CSP. ${MAIN_THREAD_FALLBACK}`;
}

export function workerCrashedMessage(detail: string): string {
    return `micugl worker: the render worker threw an uncaught error (${detail}). The worker runtime reports `
        + 'its own failures as messages, so an uncaught error means this build of micugl is broken. micugl is '
        + 'not falling back to the main thread, because that would hide the failure. Please report it.';
}

export function overrideWorkerCrashedMessage(detail: string): string {
    return 'micugl worker: the worker returned by the createWorker() factory you passed threw an uncaught error '
        + `(${detail}). The error came from that worker's own code, which micugl did not build and cannot fix. `
        + 'micugl is not falling back to the main thread, because that would hide the failure.';
}

export function unusableInlineWorkerMessage(): string {
    return 'micugl worker: the inlined worker module has no default export to construct, so a worker built '
        + 'from it would run no code and paint nothing. This build of micugl is broken: its '
        + `"?worker&inline" import did not resolve to a worker. ${ESCAPE_HATCHES}`;
}

export function requireInlineWorkerConstructor(module: unknown): InlineWorkerConstructor {
    const candidate = typeof module === 'object' && module !== null
        ? (module as { default?: unknown }).default
        : undefined;

    if (typeof candidate !== 'function') {
        throw new Error(unusableInlineWorkerMessage());
    }

    return candidate as InlineWorkerConstructor;
}

export async function createWorkerWithDeps(
    options: CreateWorkerOptions,
    deps: WorkerFactoryDeps
): Promise<Worker | null> {
    const scope = options.scope ?? (globalThis as WorkerSupportScope);
    const log = options.log ?? deps.log;

    if (!isWorkerModeSupported(scope)) {
        log(unsupportedMessage());
        return null;
    }

    const override = options.createWorker;
    if (override) {
        try {
            return override();
        } catch (error) {
            log(overrideWorkerFailedMessage(error));
            return null;
        }
    }

    const InlineWorker = requireInlineWorkerConstructor(await deps.loadInlineWorker());

    try {
        return new InlineWorker();
    } catch (error) {
        log(blobWorkerFailedMessage(error));
        return null;
    }
}

export const logWorkerIssue = createOnceLogger(message => { console.error(message) });

const defaultDeps: WorkerFactoryDeps = {
    loadInlineWorker: () => import('@/worker/workerEntry?worker&inline'),
    log: logWorkerIssue
};

export function createMicuglWorker(options: CreateWorkerOptions = {}): Promise<Worker | null> {
    return createWorkerWithDeps(options, defaultDeps);
}
