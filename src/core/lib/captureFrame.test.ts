import { describe, expect, it } from 'vitest';

import type { CaptureTarget } from '@/core/lib/captureFrame';
import { captureFrame } from '@/core/lib/captureFrame';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { createCanvasStub } from '@/testing';

describe('captureFrame', () => {
    it('reads default-dims capture from the default framebuffer via renderDefault', () => {
        const { canvas } = createCanvasStub({ canvas: { width: 64, height: 32 } });
        const manager = new WebGLManager(canvas);

        const calls: string[] = [];
        const target: CaptureTarget = {
            manager,
            renderDefault: () => { calls.push('renderDefault') },
            renderAtSize: () => { calls.push('renderAtSize') },
            restoreDisplay: () => { calls.push('restoreDisplay') }
        };

        const result = captureFrame(target, 0, 64, 32, 64, 32);

        expect(calls).toEqual(['renderDefault', 'restoreDisplay']);
        expect(result.width).toBe(64);
        expect(result.height).toBe(32);
        expect(result.pixels.length).toBe(64 * 32 * 4);
        expect(manager.fbo.getFramebufferIds()).toEqual([]);
    });

    it('renders into a scratch FBO and cleans it up for custom-dims capture', () => {
        const { canvas } = createCanvasStub({ canvas: { width: 64, height: 32 } });
        const manager = new WebGLManager(canvas);

        const calls: string[] = [];
        const target: CaptureTarget = {
            manager,
            renderDefault: () => { calls.push('renderDefault') },
            renderAtSize: () => { calls.push('renderAtSize') },
            restoreDisplay: () => { calls.push('restoreDisplay') }
        };

        const result = captureFrame(target, 0, 16, 8, 64, 32);

        expect(calls).toEqual(['renderAtSize', 'restoreDisplay']);
        expect(result.width).toBe(16);
        expect(result.height).toBe(8);
        expect(manager.fbo.getFramebufferIds()).toEqual([]);
    });

    it('throws for non-positive export dimensions', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        const target: CaptureTarget = {
            manager,
            renderDefault: () => { throw new Error('should not render') },
            renderAtSize: () => { throw new Error('should not render') },
            restoreDisplay: () => { throw new Error('should not restore') }
        };

        expect(() => captureFrame(target, 0, 0, 10, 100, 100)).toThrow(/positive/);
    });

    it('throws when a custom export size exceeds MAX_TEXTURE_SIZE', () => {
        const { canvas } = createCanvasStub({ maxTextureSize: 8 });
        const manager = new WebGLManager(canvas);
        const target: CaptureTarget = {
            manager,
            renderDefault: () => { throw new Error('should not render') },
            renderAtSize: () => { throw new Error('should not render') },
            restoreDisplay: () => { throw new Error('should not restore') }
        };

        expect(() => captureFrame(target, 0, 100, 100, 300, 150)).toThrow(/MAX_TEXTURE_SIZE/);
    });
});
