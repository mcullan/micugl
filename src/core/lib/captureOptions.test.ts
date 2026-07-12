import { describe, expect, it } from 'vitest';

import { resolveExportDimensions, validateRenderToBlobOptions } from '@/core/lib/captureOptions';

describe('validateRenderToBlobOptions', () => {
    it('throws when width is given without height', () => {
        expect(() => { validateRenderToBlobOptions({ width: 100 }) }).toThrow(/together/);
    });

    it('throws when height is given without width', () => {
        expect(() => { validateRenderToBlobOptions({ height: 100 }) }).toThrow(/together/);
    });

    it('throws when width/height are combined with scale', () => {
        expect(() => { validateRenderToBlobOptions({ width: 100, height: 100, scale: 2 }) }).toThrow(/scale/);
    });

    it('throws when steps is given without a seed', () => {
        expect(() => { validateRenderToBlobOptions({ steps: 10 }) }).toThrow(/seed/);
    });

    it('passes for width+height together', () => {
        expect(() => { validateRenderToBlobOptions({ width: 100, height: 50 }) }).not.toThrow();
    });

    it('passes for scale alone', () => {
        expect(() => { validateRenderToBlobOptions({ scale: 2 }) }).not.toThrow();
    });

    it('throws when seed is given without steps', () => {
        expect(() => { validateRenderToBlobOptions({ seed: { kind: 'clear' } }) }).toThrow(/steps/);
    });

    it('throws when frame is combined with steps', () => {
        expect(() => {
            validateRenderToBlobOptions({ frame: 30, steps: 10, seed: { kind: 'clear' } });
        }).toThrow(/frame/);
    });

    it('throws when fps is given without steps', () => {
        expect(() => { validateRenderToBlobOptions({ fps: 30 }) }).toThrow(/steps/);
    });

    it('passes for steps with a seed', () => {
        expect(() => { validateRenderToBlobOptions({ steps: 10, seed: { kind: 'clear' } }) }).not.toThrow();
    });

    it('passes for fps with steps and a seed', () => {
        expect(() => {
            validateRenderToBlobOptions({ steps: 10, fps: 30, seed: { kind: 'clear' } });
        }).not.toThrow();
    });

    it('passes for no options at all', () => {
        expect(() => { validateRenderToBlobOptions({}) }).not.toThrow();
    });
});

describe('resolveExportDimensions', () => {
    it('prefers explicit width/height over backing size', () => {
        expect(resolveExportDimensions({ width: 320, height: 180 }, 640, 360)).toEqual({ width: 320, height: 180 });
    });

    it('applies scale to the backing size, rounding to the nearest integer', () => {
        expect(resolveExportDimensions({ scale: 1.5 }, 100, 200)).toEqual({ width: 150, height: 300 });
    });

    it('clamps a scaled dimension to a minimum of 1', () => {
        expect(resolveExportDimensions({ scale: 0.001 }, 10, 10)).toEqual({ width: 1, height: 1 });
    });

    it('falls back to the backing size when neither explicit dims nor scale are given', () => {
        expect(resolveExportDimensions({}, 640, 360)).toEqual({ width: 640, height: 360 });
    });

    it('throws for a zero explicit width', () => {
        expect(() => resolveExportDimensions({ width: 0, height: 100 }, 640, 360)).toThrow(/positive integers/);
    });

    it('throws for a negative explicit height', () => {
        expect(() => resolveExportDimensions({ width: 100, height: -10 }, 640, 360)).toThrow(/positive integers/);
    });

    it('throws for a non-integer explicit width', () => {
        expect(() => resolveExportDimensions({ width: 100.5, height: 100 }, 640, 360)).toThrow(/positive integers/);
    });
});
