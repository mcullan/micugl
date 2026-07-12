import { flipYPixels } from '@/core/lib/readback';

function pixelsToCanvas(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
    const flipped = flipYPixels(pixels, width, height);
    const imageData = new ImageData(flipped, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('micugl: capture requires 2D canvas support');
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas;
}

export function pixelsToBlob(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    type?: string,
    quality?: number
): Promise<Blob> {
    const canvas = pixelsToCanvas(pixels, width, height);

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('micugl: renderToBlob failed to encode the captured frame'));
                return;
            }
            resolve(blob);
        }, type ?? 'image/png', quality);
    });
}

export function pixelsToDataURL(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    type?: string,
    quality?: number
): string {
    const canvas = pixelsToCanvas(pixels, width, height);
    return canvas.toDataURL(type ?? 'image/png', quality);
}
