import { sourceDimensions } from '@/core/lib/sourceTextureOptions';
import type { TextureUploadSource } from '@/types';

export type PotCanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export function nextPowerOfTwo(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
        return 1;
    }
    let pot = 1;
    while (pot < value) {
        pot *= 2;
    }
    return pot;
}

export function defaultPotCanvasFactory(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

export function resizeSourceToPot(
    source: TextureUploadSource,
    createCanvas: PotCanvasFactory
): TextureUploadSource {
    const { width, height } = sourceDimensions(source);
    const potWidth = nextPowerOfTwo(width);
    const potHeight = nextPowerOfTwo(height);

    if (potWidth === width && potHeight === height) {
        return source;
    }

    const canvas = createCanvas(potWidth, potHeight);
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error(
            'micugl useImageTexture: resizeToPOT needs a 2D canvas context to draw the source onto a '
            + 'power-of-two canvas, but getContext("2d") returned null.'
        );
    }

    context.drawImage(source as CanvasImageSource, 0, 0, potWidth, potHeight);
    return canvas;
}
