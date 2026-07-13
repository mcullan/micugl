import { describe, expect, it, vi } from 'vitest';

import type { CreateWorkerOptions, WorkerFactoryDeps, WorkerSupportScope } from '@/worker/createWorker';
import {
    blobWorkerFailedMessage,
    createOnceLogger,
    createWorkerWithDeps,
    inlineWorkerNeverStartedMessage,
    isWorkerModeSupported,
    overrideWorkerCrashedMessage,
    overrideWorkerFailedMessage,
    overrideWorkerNeverStartedMessage,
    requireInlineWorkerConstructor,
    unsupportedMessage,
    unusableInlineWorkerMessage,
    workerCrashedMessage
} from '@/worker/createWorker';

const WORKER = { name: 'worker' } as unknown as Worker;

function supportedScope(): WorkerSupportScope {
    return {
        OffscreenCanvas: {},
        Worker: {},
        HTMLCanvasElement: { prototype: { transferControlToOffscreen: () => undefined } }
    };
}

function inlineWorkerModule(construct: () => Worker): unknown {
    return {
        default: function InlineWorker(): Worker {
            return construct();
        }
    };
}

function createDeps(overrides: Partial<WorkerFactoryDeps> = {}): {
    deps: WorkerFactoryDeps;
    log: ReturnType<typeof vi.fn>;
    construct: ReturnType<typeof vi.fn>;
    loadInlineWorker: ReturnType<typeof vi.fn>;
    } {
    const log = vi.fn((_message: string) => undefined);
    const construct = vi.fn(() => WORKER);
    const loadInlineWorker = vi.fn(() => Promise.resolve(inlineWorkerModule(() => construct())));

    const deps: WorkerFactoryDeps = {
        loadInlineWorker: () => loadInlineWorker(),
        log: message => { log(message) },
        ...overrides
    };

    return { deps, log, construct, loadInlineWorker };
}

function options(overrides: Partial<CreateWorkerOptions> = {}): CreateWorkerOptions {
    return { scope: supportedScope(), ...overrides };
}

describe('isWorkerModeSupported', () => {
    it('accepts a browser with OffscreenCanvas, Worker and transferControlToOffscreen', () => {
        expect(isWorkerModeSupported(supportedScope())).toBe(true);
    });

    it('rejects an environment without OffscreenCanvas', () => {
        const scope = supportedScope();
        scope.OffscreenCanvas = undefined;
        expect(isWorkerModeSupported(scope)).toBe(false);
    });

    it('rejects an environment without Worker', () => {
        const scope = supportedScope();
        scope.Worker = undefined;
        expect(isWorkerModeSupported(scope)).toBe(false);
    });

    it('rejects a browser whose canvas cannot transfer control offscreen', () => {
        const scope = supportedScope();
        scope.HTMLCanvasElement = { prototype: {} };
        expect(isWorkerModeSupported(scope)).toBe(false);
    });

    it('rejects a server-side scope with no canvas class at all', () => {
        expect(isWorkerModeSupported({})).toBe(false);
    });
});

describe('requireInlineWorkerConstructor', () => {
    it('returns the default export of the inlined worker module', () => {
        const construct = (): Worker => WORKER;
        const InlineWorker = requireInlineWorkerConstructor(inlineWorkerModule(construct));

        expect(new InlineWorker()).toBe(WORKER);
    });

    it.each([
        ['a module with no default export', {}],
        ['a default export that is not constructible', { default: 'not a worker' }],
        ['nothing at all', null],
        ['an undefined module', undefined]
    ])('fails loud rather than paint nothing for %s', (_label, module) => {
        expect(() => requireInlineWorkerConstructor(module)).toThrow(/no default export to construct/);
    });
});

describe('createWorkerWithDeps inline worker', () => {
    it('constructs the worker the ?worker&inline import resolved to', async () => {
        const { deps, construct, loadInlineWorker, log } = createDeps();

        const worker = await createWorkerWithDeps(options(), deps);

        expect(worker).toBe(WORKER);
        expect(loadInlineWorker).toHaveBeenCalledTimes(1);
        expect(construct).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
    });

    it('throws instead of constructing a worker that would run no code', async () => {
        const { deps, construct } = createDeps({ loadInlineWorker: () => Promise.resolve({}) });

        await expect(createWorkerWithDeps(options(), deps))
            .rejects.toThrow(/no default export to construct/);
        expect(construct).not.toHaveBeenCalled();
    });
});

describe('createWorkerWithDeps fallback', () => {
    it('falls back to the main thread, logging why, when the browser cannot do worker mode', async () => {
        const { deps, log, loadInlineWorker } = createDeps();

        const worker = await createWorkerWithDeps(options({ scope: {} }), deps);

        expect(worker).toBeNull();
        expect(loadInlineWorker).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(unsupportedMessage());
    });

    it('falls back to the main thread when a CSP blocks the blob worker, naming both remedies', async () => {
        const cspError = new Error('Refused to create a worker from blob: because it violates the CSP');
        const { deps, log } = createDeps({
            loadInlineWorker: () => Promise.resolve(inlineWorkerModule(() => { throw cspError }))
        });

        const worker = await createWorkerWithDeps(options(), deps);

        expect(worker).toBeNull();
        expect(log).toHaveBeenCalledWith(blobWorkerFailedMessage(cspError));

        const message = log.mock.calls[0][0] as string;
        expect(message).toContain('worker-src \'self\' blob:');
        expect(message).toContain('createWorker=');
        expect(message).toContain('micugl/worker');
        expect(message).toContain('violates the CSP');
    });
});

describe('createWorkerWithDeps createWorker override', () => {
    it('uses the caller-supplied worker and never touches the inlined worker', async () => {
        const custom = { name: 'custom' } as unknown as Worker;
        const { deps, loadInlineWorker, construct } = createDeps();

        const worker = await createWorkerWithDeps(options({ createWorker: () => custom }), deps);

        expect(worker).toBe(custom);
        expect(loadInlineWorker).not.toHaveBeenCalled();
        expect(construct).not.toHaveBeenCalled();
    });

    it('blames the caller factory, not a blob CSP, when the caller-supplied factory throws', async () => {
        const { deps, log } = createDeps();

        const worker = await createWorkerWithDeps(
            options({
                createWorker: () => {
                    throw new Error('module worker blocked');
                }
            }),
            deps
        );

        expect(worker).toBeNull();
        expect(log).toHaveBeenCalledWith(overrideWorkerFailedMessage(new Error('module worker blocked')));

        const message = log.mock.calls[0][0] as string;
        expect(message).toContain('createWorker() factory you passed threw (module worker blocked)');
        expect(message).toContain('worker-src \'self\'');
        expect(message).not.toContain('blob:');
    });

    it('still refuses to run when the browser cannot transfer a canvas offscreen', async () => {
        const custom = vi.fn(() => WORKER);
        const { deps, log } = createDeps();

        const worker = await createWorkerWithDeps(
            options({ scope: { ...supportedScope(), OffscreenCanvas: undefined }, createWorker: custom }),
            deps
        );

        expect(worker).toBeNull();
        expect(custom).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(unsupportedMessage());
    });
});

describe('worker error messages', () => {
    it('blames a blob CSP only for the worker micugl built itself', () => {
        expect(inlineWorkerNeverStartedMessage()).toContain('worker-src \'self\' blob:');
        expect(overrideWorkerNeverStartedMessage()).not.toContain('blob:');
        expect(overrideWorkerNeverStartedMessage()).toContain('createWorker() factory');
    });

    it('never offers a main-thread fallback for a worker that started and then threw', () => {
        const inline = workerCrashedMessage('u_level is not a function');
        const override = overrideWorkerCrashedMessage('u_level is not a function');

        for (const message of [inline, override]) {
            expect(message).toContain('u_level is not a function');
            expect(message).toContain('not falling back to the main thread');
            expect(message).not.toContain('Content-Security-Policy');
        }

        expect(inline).toContain('this build of micugl is broken');
        expect(override).toContain('createWorker() factory');
        expect(override).not.toContain('micugl is broken');
    });
});

describe('createOnceLogger', () => {
    it('logs each distinct message exactly once', () => {
        const sink = vi.fn();
        const log = createOnceLogger(sink);

        log(unsupportedMessage());
        log(unsupportedMessage());
        log(unusableInlineWorkerMessage());

        expect(sink).toHaveBeenCalledTimes(2);
    });
});
