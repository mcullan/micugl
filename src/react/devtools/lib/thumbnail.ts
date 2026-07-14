import type { FramebufferReadResult } from '@/core/managers/FBOManager';
import { flipImageRows } from '@/react/devtools/lib/flipRows';

export function paintFramebufferThumbnail(
    canvas: HTMLCanvasElement,
    scratchRef: { current: HTMLCanvasElement | null },
    result: FramebufferReadResult
): void {
    const flipped = flipImageRows(result.pixels, result.width, result.height);
    let scratch = scratchRef.current;
    if (!scratch) {
        scratch = document.createElement('canvas');
        scratchRef.current = scratch;
    }
    scratch.width = result.width;
    scratch.height = result.height;
    const scratchCtx = scratch.getContext('2d');
    if (!scratchCtx) {
        return;
    }
    scratchCtx.putImageData(new ImageData(flipped, result.width, result.height), 0, 0);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scratch, 0, 0, result.width, result.height, 0, 0, canvas.width, canvas.height);
}
