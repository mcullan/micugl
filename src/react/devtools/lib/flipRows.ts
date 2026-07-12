import { flipYPixels } from '@/core/lib/readback';

export function flipImageRows(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    return flipYPixels(pixels, width, height);
}
