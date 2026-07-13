import { useEffect, useRef, useState } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type { PotCanvasFactory } from '@/react/lib/potCanvas';
import { defaultPotCanvasFactory, resizeSourceToPot } from '@/react/lib/potCanvas';
import type {
    ImageInput,
    SourceTextureOptions,
    TextureSource,
    TextureStatus,
    TextureUploadSource
} from '@/types';

export interface ImageTextureDeps {
    createImageBitmap?: (source: Blob) => Promise<ImageBitmap>;
    createImage?: () => HTMLImageElement;
    createPotCanvas?: PotCanvasFactory;
}

export interface ImageTextureOptions extends SourceTextureOptions {
    resizeToPOT?: boolean;
    crossOrigin?: string;
    onError?: (error: unknown) => void;
    deps?: ImageTextureDeps;
}

export interface ImageTextureResult {
    texture: TextureSource;
    status: TextureStatus;
    error: unknown;
}

interface ResolvedLoaderDeps {
    createImageBitmap: (source: Blob) => Promise<ImageBitmap>;
    createImage: () => HTMLImageElement;
}

let imageTextureCounter = 0;

function isBlob(value: unknown): value is Blob {
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isImageElement(value: unknown): value is HTMLImageElement {
    return typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement;
}

async function decodeInput(
    input: ImageInput,
    crossOrigin: string,
    deps: ResolvedLoaderDeps
): Promise<TextureUploadSource> {
    if (typeof input === 'string') {
        const image = deps.createImage();
        image.crossOrigin = crossOrigin;
        image.src = input;
        await image.decode();
        return image;
    }
    if (isBlob(input)) {
        return deps.createImageBitmap(input);
    }
    if (isImageElement(input)) {
        if (!(input.complete && input.naturalWidth > 0)) {
            await input.decode();
        }
        return input;
    }
    return input;
}

export function useImageTexture(input: ImageInput | null, options?: ImageTextureOptions): ImageTextureResult {
    const resolved = resolveSourceTextureOptions(options as SourceTextureOptions | undefined);
    const resizeToPOT = options?.resizeToPOT ?? false;
    const optionsKey = `${JSON.stringify(resolved)}|${String(resizeToPOT)}`;

    const idRef = useRef('');
    if (idRef.current === '') {
        imageTextureCounter += 1;
        idRef.current = `image-texture-${String(imageTextureCounter)}`;
    }

    const frameRef = useRef<TextureUploadSource | null>(null);
    const versionRef = useRef(0);
    const invalidationRef = useRef<FrameInvalidation | null>(null);
    const invalidation = (invalidationRef.current ??= createFrameInvalidation());
    const errorRef = useRef<unknown>(null);

    const sourceRef = useRef<TextureSource | null>(null);
    const sourceKeyRef = useRef('');
    if (sourceRef.current === null || sourceKeyRef.current !== optionsKey) {
        sourceKeyRef.current = optionsKey;
        sourceRef.current = {
            id: idRef.current,
            get version() { return versionRef.current },
            options: resolved,
            getFrame: () => frameRef.current,
            invalidation
        };
    }
    const source = sourceRef.current;

    const [status, setStatus] = useState<TextureStatus>(input === null ? 'idle' : 'loading');
    const [error, setError] = useState<unknown>(null);

    const configRef = useRef({
        crossOrigin: options?.crossOrigin ?? 'anonymous',
        onError: options?.onError,
        deps: options?.deps,
        resizeToPOT
    });
    configRef.current = {
        crossOrigin: options?.crossOrigin ?? 'anonymous',
        onError: options?.onError,
        deps: options?.deps,
        resizeToPOT
    };

    useEffect(() => {
        if (input === null) {
            setStatus('idle');
            return;
        }

        let cancelled = false;
        setStatus('loading');

        const run = async (): Promise<void> => {
            const { crossOrigin, deps, resizeToPOT: shouldResize, onError } = configRef.current;
            const loaderDeps: ResolvedLoaderDeps = {
                createImageBitmap: deps?.createImageBitmap ?? (source => createImageBitmap(source)),
                createImage: deps?.createImage ?? (() => new Image())
            };

            try {
                const decoded = await decodeInput(input, crossOrigin, loaderDeps);
                if (cancelled) return;

                const frame = shouldResize
                    ? resizeSourceToPot(decoded, deps?.createPotCanvas ?? defaultPotCanvasFactory)
                    : decoded;

                frameRef.current = frame;
                versionRef.current += 1;
                errorRef.current = null;
                invalidation.request();
                setError(null);
                setStatus('ready');
            } catch (caught) {
                if (cancelled) return;
                errorRef.current = caught;
                setError(caught);
                setStatus('error');
                onError?.(caught);
            }
        };

        void run();

        return () => { cancelled = true };
    }, [input, optionsKey, invalidation]);

    if (status === 'error' && options?.onError === undefined) {
        throw errorRef.current;
    }

    return { texture: source, status, error };
}
