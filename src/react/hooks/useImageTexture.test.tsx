import { act, Component, type ReactElement, type ReactNode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import type { ImageTextureDeps, ImageTextureOptions, ImageTextureResult } from '@/react/hooks/useImageTexture';
import { useImageTexture } from '@/react/hooks/useImageTexture';
import type { ImageInput } from '@/types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

interface Probe {
    current: ImageTextureResult | null;
}

interface SceneProps {
    input: ImageInput | null;
    options?: ImageTextureOptions;
    probe: Probe;
    statuses?: string[];
    kinds?: InvalidationKind[];
}

const Scene = ({ input, options, probe, statuses, kinds }: SceneProps) => {
    const result = useImageTexture(input, options);
    probe.current = result;
    statuses?.push(result.status);

    const invalidation = result.texture.invalidation;
    useEffect(() => {
        if (!kinds) return;
        return invalidation.connect(kind => { kinds.push(kind) });
    }, [invalidation, kinds]);

    return null;
};

class ErrorBoundary extends Component<{ children: ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        this.props.onError(error);
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children;
    }
}

function currentResult(probe: Probe): ImageTextureResult {
    if (!probe.current) {
        throw new Error('the image-texture scene has not rendered yet');
    }
    return probe.current;
}

function bitmap(width: number, height: number): ImageInput {
    return { width, height } as unknown as ImageInput;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej });
    return { promise, resolve, reject };
}

describe('useImageTexture: a direct ImageBitmap source', () => {
    it('is ready after the mount effect, bumps the version once, and requests one discrete frame', async () => {
        const probe: Probe = { current: null };
        const kinds: InvalidationKind[] = [];
        const frame = bitmap(64, 48);

        await mount(<Scene input={frame} probe={probe} kinds={kinds} />);
        await flush();

        const result = currentResult(probe);
        expect(result.status).toBe('ready');
        expect(result.texture.getFrame()).toBe(frame);
        expect(result.texture.version).toBe(1);
        expect(kinds).toEqual(['discrete']);
    });
});

describe('useImageTexture: a URL source through an injected image factory', () => {
    it('moves from loading to ready and sets crossOrigin before src', async () => {
        const ops: string[] = [];
        let crossOrigin = '';
        let src = '';
        const image = {
            set crossOrigin(value: string) { ops.push(`cross:${value}`); crossOrigin = value },
            get crossOrigin() { return crossOrigin },
            set src(value: string) { ops.push(`src:${value}`); src = value },
            get src() { return src },
            decode: () => Promise.resolve(),
            complete: false,
            naturalWidth: 0
        };
        const deps: ImageTextureDeps = { createImage: () => image as unknown as HTMLImageElement };

        const probe: Probe = { current: null };
        const statuses: string[] = [];

        await mount(<Scene input='https://example.test/a.png' options={{ deps }} probe={probe} statuses={statuses} />);
        await flush();

        expect(statuses[0]).toBe('loading');
        expect(currentResult(probe).status).toBe('ready');
        expect(ops).toEqual(['cross:anonymous', 'src:https://example.test/a.png']);
    });
});

describe('useImageTexture: the error surface', () => {
    it('re-throws the stored error on the next render when no onError is supplied', async () => {
        const probe: Probe = { current: null };
        let boundaryError: unknown = null;
        const failure = new Error('decode failed');
        const deps: ImageTextureDeps = { createImageBitmap: () => Promise.reject(failure) };
        const blob = new Blob(['x']);

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <Scene input={blob} options={{ deps }} probe={probe} />
            </ErrorBoundary>
        );
        await flush();

        expect(boundaryError).toBe(failure);
    });

    it('calls onError once, sets status error, and does not throw when onError is supplied', async () => {
        const probe: Probe = { current: null };
        let boundaryError: unknown = null;
        const reports: unknown[] = [];
        const failure = new Error('decode failed');
        const deps: ImageTextureDeps = { createImageBitmap: () => Promise.reject(failure) };
        const blob = new Blob(['x']);

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <Scene input={blob} options={{ deps, onError: error => { reports.push(error) } }} probe={probe} />
            </ErrorBoundary>
        );
        await flush();

        expect(boundaryError).toBeNull();
        expect(reports).toEqual([failure]);
        expect(currentResult(probe).status).toBe('error');
        expect(currentResult(probe).error).toBe(failure);
    });
});

describe('useImageTexture: a superseded load', () => {
    it('does not let a slow first input overwrite the frame a faster second input already landed', async () => {
        const pending: { resolve: (value: ImageBitmap) => void }[] = [];
        const deps: ImageTextureDeps = {
            createImageBitmap: () => {
                const control = deferred<ImageBitmap>();
                pending.push({ resolve: control.resolve });
                return control.promise;
            }
        };
        const probe: Probe = { current: null };
        const slow = new Blob(['slow']);
        const fast = new Blob(['fast']);

        await mount(<Scene input={slow} options={{ deps }} probe={probe} />);
        await flush();
        await mount(<Scene input={fast} options={{ deps }} probe={probe} />);
        await flush();

        const fastFrame = bitmap(200, 100);
        const slowFrame = bitmap(50, 40);

        await act(async () => {
            pending[1].resolve(fastFrame as unknown as ImageBitmap);
            await Promise.resolve();
        });
        await flush();

        expect(currentResult(probe).texture.getFrame()).toBe(fastFrame);
        expect(currentResult(probe).texture.version).toBe(1);

        await act(async () => {
            pending[0].resolve(slowFrame as unknown as ImageBitmap);
            await Promise.resolve();
        });
        await flush();

        expect(currentResult(probe).texture.getFrame()).toBe(fastFrame);
        expect(currentResult(probe).texture.version).toBe(1);
    });
});

describe('useImageTexture: resizeToPOT', () => {
    it('draws a non-power-of-two source onto the injected power-of-two canvas with stretch args', async () => {
        const drawCalls: unknown[][] = [];
        let potCanvas: { width: number; height: number } | null = null;
        const deps: ImageTextureDeps = {
            createPotCanvas: (width, height) => {
                const canvas = {
                    width,
                    height,
                    getContext: (kind: string) =>
                        (kind === '2d'
                            ? { drawImage: (...args: unknown[]) => { drawCalls.push(args) } }
                            : null)
                };
                potCanvas = canvas;
                return canvas as unknown as HTMLCanvasElement;
            }
        };
        const probe: Probe = { current: null };
        const source = bitmap(640, 480);

        await mount(<Scene input={source} options={{ resizeToPOT: true, deps }} probe={probe} />);
        await flush();

        expect(potCanvas).not.toBeNull();
        expect(potCanvas).toMatchObject({ width: 1024, height: 512 });
        expect(currentResult(probe).texture.getFrame()).toBe(potCanvas);
        expect(drawCalls).toEqual([[source, 0, 0, 1024, 512]]);
    });

    it('passes an already-power-of-two source straight through without copying it', async () => {
        let copies = 0;
        const deps: ImageTextureDeps = {
            createPotCanvas: (width, height) => {
                copies += 1;
                return { width, height, getContext: () => null } as unknown as HTMLCanvasElement;
            }
        };
        const probe: Probe = { current: null };
        const source = bitmap(256, 256);

        await mount(<Scene input={source} options={{ resizeToPOT: true, deps }} probe={probe} />);
        await flush();

        expect(copies).toBe(0);
        expect(currentResult(probe).texture.getFrame()).toBe(source);
    });
});
