import type { RenderToBlobOptions } from '@/types';

export interface ResolvedExportDimensions {
    width: number;
    height: number;
}

export function validateRenderToBlobOptions(options: RenderToBlobOptions): void {
    const hasWidth = options.width !== undefined;
    const hasHeight = options.height !== undefined;

    if (hasWidth !== hasHeight) {
        throw new Error('renderToBlob: width and height must be provided together');
    }

    if ((hasWidth || hasHeight) && options.scale !== undefined) {
        throw new Error('renderToBlob: width/height cannot be combined with scale');
    }

    if (options.steps !== undefined && options.seed === undefined) {
        throw new Error('renderToBlob: steps requires a seed');
    }

    if (options.seed !== undefined && options.steps === undefined) {
        throw new Error('renderToBlob: seed requires steps');
    }

    if (options.frame !== undefined && options.steps !== undefined) {
        throw new Error('renderToBlob: frame cannot be combined with seed/steps');
    }

    if (options.fps !== undefined && options.steps === undefined) {
        throw new Error('renderToBlob: fps requires steps');
    }
}

export function resolveExportDimensions(
    options: Pick<RenderToBlobOptions, 'width' | 'height' | 'scale'>,
    backingWidth: number,
    backingHeight: number
): ResolvedExportDimensions {
    let width: number;
    let height: number;

    if (options.width !== undefined && options.height !== undefined) {
        width = options.width;
        height = options.height;
    } else if (options.scale !== undefined) {
        width = Math.max(1, Math.round(backingWidth * options.scale));
        height = Math.max(1, Math.round(backingHeight * options.scale));
    } else {
        width = backingWidth;
        height = backingHeight;
    }

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error(
            `renderToBlob: resolved export dimensions must be positive integers, got ${String(width)}x${String(height)}`
        );
    }

    return { width, height };
}
