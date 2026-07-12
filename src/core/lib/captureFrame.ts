import type { WebGLManager } from '@/core/managers/WebGLManager';

export interface CaptureTarget {
    manager: WebGLManager;
    renderAtSize: (timeMs: number, width: number, height: number) => void;
    renderDefault: (timeMs: number) => void;
    restoreDisplay: () => void;
}

export interface CaptureResult {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}

export const CAPTURE_SCRATCH_FRAMEBUFFER_ID = '__micugl-capture-scratch__';

export function captureFrame(
    target: CaptureTarget,
    timeMs: number,
    exportWidth: number,
    exportHeight: number,
    displayWidth: number,
    displayHeight: number
): CaptureResult {
    if (exportWidth <= 0 || exportHeight <= 0) {
        throw new Error(
            `captureFrame: export dimensions must be positive, got ${String(exportWidth)}x${String(exportHeight)}`
        );
    }

    const gl = target.manager.context;

    if (exportWidth === displayWidth && exportHeight === displayHeight) {
        target.renderDefault(timeMs);
        const pixels = target.manager.readPixels(exportWidth, exportHeight);
        target.restoreDisplay();
        return { pixels, width: exportWidth, height: exportHeight };
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (exportWidth > maxTextureSize || exportHeight > maxTextureSize) {
        throw new Error(
            `captureFrame: export size ${String(exportWidth)}x${String(exportHeight)} exceeds MAX_TEXTURE_SIZE ${String(maxTextureSize)}`
        );
    }

    target.manager.fbo.createFramebuffer(CAPTURE_SCRATCH_FRAMEBUFFER_ID, {
        width: exportWidth,
        height: exportHeight,
        textureCount: 1,
        textureOptions: {
            type: gl.UNSIGNED_BYTE,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST
        }
    });

    let pixels: Uint8ClampedArray;
    try {
        target.manager.fbo.bindFramebuffer(CAPTURE_SCRATCH_FRAMEBUFFER_ID, 0);
        target.renderAtSize(timeMs, exportWidth, exportHeight);
        pixels = target.manager.readPixels(exportWidth, exportHeight);
    } finally {
        target.manager.fbo.bindFramebuffer(null);
        target.manager.fbo.destroy(CAPTURE_SCRATCH_FRAMEBUFFER_ID);
    }
    target.restoreDisplay();

    return { pixels, width: exportWidth, height: exportHeight };
}
