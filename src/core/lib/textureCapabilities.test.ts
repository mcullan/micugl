import { describe, expect, it } from 'vitest';

import {
    GL_FLOAT,
    GL_HALF_FLOAT_OES,
    GL_LINEAR,
    GL_NEAREST,
    GL_UNSIGNED_BYTE
} from '@/core/lib/glConstants';
import type { TextureCapabilities } from '@/core/lib/textureCapabilities';
import { resolveTextureType } from '@/core/lib/textureCapabilities';

const caps = (overrides: Partial<TextureCapabilities> = {}): TextureCapabilities => ({
    floatRenderable: false,
    halfFloatRenderable: false,
    floatLinearFilterable: false,
    halfFloatLinearFilterable: false,
    halfFloatType: GL_HALF_FLOAT_OES,
    ...overrides
});

const linear = { minFilter: GL_LINEAR, magFilter: GL_LINEAR };

describe('resolveTextureType', () => {
    it('passes a non-float type through unchanged', () => {
        const resolved = resolveTextureType({ type: GL_UNSIGNED_BYTE, ...linear }, caps());
        expect(resolved).toEqual({
            type: GL_UNSIGNED_BYTE,
            minFilter: GL_LINEAR,
            magFilter: GL_LINEAR,
            filterDowngraded: false
        });
    });

    it('defaults an omitted type to UNSIGNED_BYTE without touching filters', () => {
        const resolved = resolveTextureType({ ...linear }, caps({ floatRenderable: true }));
        expect(resolved.type).toBe(GL_UNSIGNED_BYTE);
        expect(resolved.filterDowngraded).toBe(false);
    });

    it('keeps FLOAT with LINEAR when float is renderable and filterable', () => {
        const resolved = resolveTextureType(
            { type: GL_FLOAT, ...linear },
            caps({ floatRenderable: true, floatLinearFilterable: true })
        );
        expect(resolved.type).toBe(GL_FLOAT);
        expect(resolved.minFilter).toBe(GL_LINEAR);
        expect(resolved.filterDowngraded).toBe(false);
    });

    it('downgrades LINEAR to NEAREST when float is renderable but not filterable', () => {
        const resolved = resolveTextureType(
            { type: GL_FLOAT, ...linear },
            caps({ floatRenderable: true, floatLinearFilterable: false })
        );
        expect(resolved.type).toBe(GL_FLOAT);
        expect(resolved.minFilter).toBe(GL_NEAREST);
        expect(resolved.magFilter).toBe(GL_NEAREST);
        expect(resolved.filterDowngraded).toBe(true);
    });

    it('falls back FLOAT to HALF_FLOAT when only half-float is renderable', () => {
        const resolved = resolveTextureType(
            { type: GL_FLOAT, ...linear },
            caps({ halfFloatRenderable: true, halfFloatLinearFilterable: true })
        );
        expect(resolved.type).toBe(GL_HALF_FLOAT_OES);
        expect(resolved.minFilter).toBe(GL_LINEAR);
    });

    it('throws for a FLOAT request when neither FLOAT nor HALF_FLOAT is renderable', () => {
        expect(() => resolveTextureType({ type: GL_FLOAT, ...linear }, caps()))
            .toThrow(/Refusing to fall back to UNSIGNED_BYTE/);
    });

    it('resolves a HALF_FLOAT request to the device half-float enum when renderable', () => {
        const resolved = resolveTextureType(
            { type: GL_HALF_FLOAT_OES, ...linear },
            caps({ halfFloatRenderable: true, halfFloatLinearFilterable: false })
        );
        expect(resolved.type).toBe(GL_HALF_FLOAT_OES);
        expect(resolved.minFilter).toBe(GL_NEAREST);
        expect(resolved.filterDowngraded).toBe(true);
    });

    it('upgrades a HALF_FLOAT request to FLOAT when half-float is unavailable but float is renderable', () => {
        const resolved = resolveTextureType(
            { type: GL_HALF_FLOAT_OES, ...linear },
            caps({ floatRenderable: true, floatLinearFilterable: true })
        );
        expect(resolved.type).toBe(GL_FLOAT);
    });

    it('throws for a HALF_FLOAT request when nothing float-like is renderable', () => {
        expect(() => resolveTextureType({ type: GL_HALF_FLOAT_OES, ...linear }, caps()))
            .toThrow();
    });
});
