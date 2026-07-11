import { describe, expect, it } from 'vitest';

import {
    capPixelCount,
    DEFAULT_MAX_PIXEL_COUNT,
    resolveDeviceResolution,
    resolveDpr,
    resolveResolution
} from '@/react/lib/resolution';

describe('resolveDpr', () => {
    it('clamps device pixel ratio into the default [1, 2] range', () => {
        expect(resolveDpr(3, [1, 2], undefined, false)).toBe(2);
        expect(resolveDpr(0.5, [1, 2], undefined, false)).toBe(1);
        expect(resolveDpr(1.5, [1, 2], undefined, false)).toBe(1.5);
    });

    it('uses a fixed dpr when a single number is given', () => {
        expect(resolveDpr(3, 1, undefined, false)).toBe(1);
        expect(resolveDpr(1, 2, undefined, false)).toBe(2);
    });

    it('lets the deprecated pixelRatio override win', () => {
        expect(resolveDpr(3, [1, 2], 4, false)).toBe(4);
        expect(resolveDpr(3, [1, 2], 4, true)).toBe(4);
    });

    it('forces dpr 1 when device pixel ratio is disabled', () => {
        expect(resolveDpr(3, [1, 2], undefined, true)).toBe(1);
    });
});

describe('resolveResolution', () => {
    it('multiplies display size by the resolved dpr', () => {
        const result = resolveResolution({
            displayWidth: 800,
            displayHeight: 600,
            devicePixelRatio: 2
        });

        expect(result).toEqual({ renderWidth: 1600, renderHeight: 1200, dpr: 2 });
    });

    it('applies the default [1, 2] clamp instead of raw device pixel ratio', () => {
        const result = resolveResolution({
            displayWidth: 1000,
            displayHeight: 1000,
            devicePixelRatio: 3
        });

        expect(result.dpr).toBe(2);
        expect(result.renderWidth).toBe(2000);
    });

    it('caps the pixel count with a proportional downscale', () => {
        const result = resolveResolution({
            displayWidth: 4000,
            displayHeight: 4000,
            devicePixelRatio: 1,
            dpr: 1,
            maxPixelCount: 4_000_000
        });

        expect(result.renderWidth * result.renderHeight).toBeLessThanOrEqual(4_000_000);
        expect(result.renderWidth).toBe(result.renderHeight);
        expect(result.renderWidth).toBe(2000);
    });

    it('leaves resolutions under the cap untouched', () => {
        const result = resolveResolution({
            displayWidth: 1920,
            displayHeight: 1080,
            devicePixelRatio: 1,
            dpr: 1,
            maxPixelCount: DEFAULT_MAX_PIXEL_COUNT
        });

        expect(result).toEqual({ renderWidth: 1920, renderHeight: 1080, dpr: 1 });
    });

    it('caps width times height times dpr squared', () => {
        const result = resolveResolution({
            displayWidth: 2048,
            displayHeight: 2048,
            devicePixelRatio: 2,
            dpr: 2,
            maxPixelCount: DEFAULT_MAX_PIXEL_COUNT
        });

        expect(result.renderWidth * result.renderHeight).toBeLessThanOrEqual(DEFAULT_MAX_PIXEL_COUNT);
    });

    it('handles a zero-sized display without dividing by zero', () => {
        const result = resolveResolution({
            displayWidth: 0,
            displayHeight: 0,
            devicePixelRatio: 2
        });

        expect(result.renderWidth).toBe(0);
        expect(result.renderHeight).toBe(0);
    });
});

describe('resolveDeviceResolution', () => {
    it('passes device pixels through without re-applying dpr', () => {
        const result = resolveDeviceResolution({
            deviceWidth: 1600,
            deviceHeight: 1200,
            devicePixelRatio: 2
        });

        expect(result).toEqual({ renderWidth: 1600, renderHeight: 1200, dpr: 2 });
    });

    it('rescales device pixels when the dpr clamp or an override applies', () => {
        expect(resolveDeviceResolution({
            deviceWidth: 3000,
            deviceHeight: 3000,
            devicePixelRatio: 3
        })).toEqual({ renderWidth: 2000, renderHeight: 2000, dpr: 2 });

        expect(resolveDeviceResolution({
            deviceWidth: 1600,
            deviceHeight: 1200,
            devicePixelRatio: 2,
            pixelRatioOverride: 1
        })).toEqual({ renderWidth: 800, renderHeight: 600, dpr: 1 });

        expect(resolveDeviceResolution({
            deviceWidth: 1600,
            deviceHeight: 1200,
            devicePixelRatio: 2,
            disableDevicePixelRatio: true
        })).toEqual({ renderWidth: 800, renderHeight: 600, dpr: 1 });
    });

    it('caps the device pixel count exactly once', () => {
        const result = resolveDeviceResolution({
            deviceWidth: 4000,
            deviceHeight: 4000,
            devicePixelRatio: 1,
            maxPixelCount: 4_000_000
        });

        expect(result.renderWidth).toBe(2000);
        expect(result.renderHeight).toBe(2000);
    });
});

describe('capPixelCount', () => {
    it('leaves sizes under the cap untouched', () => {
        expect(capPixelCount(1920, 1080, DEFAULT_MAX_PIXEL_COUNT)).toEqual({ width: 1920, height: 1080 });
    });

    it('downscales proportionally over the cap', () => {
        const capped = capPixelCount(4000, 4000, 4_000_000);
        expect(capped.width).toBe(2000);
        expect(capped.height).toBe(2000);
    });

    it('does not divide by zero at zero size', () => {
        expect(capPixelCount(0, 0, 1000)).toEqual({ width: 0, height: 0 });
    });
});
