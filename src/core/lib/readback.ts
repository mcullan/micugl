export function flipYPixels(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const rowBytes = width * 4;
    if (pixels.length !== rowBytes * height) {
        throw new Error(
            `micugl: pixel buffer length ${String(pixels.length)} does not match ${String(width)}x${String(height)}x4`
        );
    }

    const flipped = new Uint8ClampedArray(pixels.length);
    for (let row = 0; row < height; row++) {
        const srcStart = row * rowBytes;
        const destStart = (height - 1 - row) * rowBytes;
        flipped.set(pixels.subarray(srcStart, srcStart + rowBytes), destStart);
    }

    return flipped;
}
