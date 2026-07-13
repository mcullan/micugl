import { sourceDimensions } from '@/core/lib/sourceTextureOptions';
import type { TextureUploadSource } from '@/types';

export type PotCanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export function nextPowerOfTwo(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
        throw new Error(
            `micugl nextPowerOfTwo: a texture dimension must be a finite number of at least 1, got ${String(value)}.`
        );
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

function isImageData(source: TextureUploadSource): source is ImageData {
    return typeof ImageData !== 'undefined' && source instanceof ImageData;
}

export function resizeSourceToPot(
    source: TextureUploadSource,
    createCanvas: PotCanvasFactory
): TextureUploadSource {
    const { width, height } = sourceDimensions(source);
    if (width < 1 || height < 1) {
        throw new Error(
            `micugl textures: resizeToPOT got a source measuring ${width}x${height}. A source without `
            + 'positive dimensions has no pixels to draw onto a power-of-two canvas, and copying it would upload '
            + 'a blank texture instead of failing loud. Size or decode the source before passing it in.'
        );
    }
    const potWidth = nextPowerOfTwo(width);
    const potHeight = nextPowerOfTwo(height);

    if (potWidth === width && potHeight === height) {
        return source;
    }

    if (isImageData(source)) {
        throw new Error(
            'micugl textures: resizeToPOT cannot draw an ImageData source onto a power-of-two canvas '
            + 'because ImageData is not a CanvasImageSource that drawImage accepts. Convert the ImageData with '
            + 'createImageBitmap(imageData) before passing it in, or drop resizeToPOT for this input.'
        );
    }

    const canvas = createCanvas(potWidth, potHeight);
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error(
            'micugl textures: resizeToPOT needs a 2D canvas context to draw the source onto a '
            + 'power-of-two canvas, but getContext("2d") returned null.'
        );
    }

    context.drawImage(source, 0, 0, potWidth, potHeight);
    return canvas;
}
