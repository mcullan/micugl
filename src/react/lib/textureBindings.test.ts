import { describe, expect, it } from 'vitest';

import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { augmentConfigWithSamplers, buildTextureBindings } from '@/react/lib/textureBindings';
import type { ShaderProgramConfig, TextureSource } from '@/types';

function source(id: string): TextureSource {
    return {
        id,
        version: 0,
        options: resolveSourceTextureOptions(),
        getFrame: () => null,
        invalidation: createFrameInvalidation()
    };
}

describe('buildTextureBindings', () => {
    it('assigns units 0..n-1 in insertion order and normalizes each key to a sampler name', () => {
        const bindings = buildTextureBindings({
            image: source('a'),
            u_overlay: source('b'),
            mask: source('c')
        });

        expect(bindings.map(({ unit, samplerName, source: s }) => ({ unit, samplerName, id: s.id }))).toEqual([
            { unit: 0, samplerName: 'u_image', id: 'a' },
            { unit: 1, samplerName: 'u_overlay', id: 'b' },
            { unit: 2, samplerName: 'u_mask', id: 'c' }
        ]);
    });

    it('maps a bare "image" key to "u_image", the same convention the uniforms prop uses', () => {
        const [binding] = buildTextureBindings({ image: source('a') });
        expect(binding.samplerName).toBe('u_image');
        expect(binding.unit).toBe(0);
    });
});

describe('augmentConfigWithSamplers', () => {
    const baseConfig: ShaderProgramConfig = {
        vertexShader: 'void main() {}',
        fragmentShader: 'void main() {}',
        uniforms: [
            { name: 'u_time', type: 'float' },
            { name: 'u_resolution', type: 'vec2' }
        ]
    };

    it('appends a sampler2D declaration for each texture name not already declared', () => {
        const bindings = buildTextureBindings({ image: source('a'), overlay: source('b') });
        const augmented = augmentConfigWithSamplers(baseConfig, bindings);

        expect(augmented.uniforms).toEqual([
            { name: 'u_time', type: 'float' },
            { name: 'u_resolution', type: 'vec2' },
            { name: 'u_image', type: 'sampler2D' },
            { name: 'u_overlay', type: 'sampler2D' }
        ]);
    });

    it('leaves an existing user declaration alone, even a deliberately-wrong float, for createProgram to reject', () => {
        const userConfig: ShaderProgramConfig = {
            ...baseConfig,
            uniforms: [
                ...baseConfig.uniforms,
                { name: 'u_image', type: 'sampler2D' },
                { name: 'u_overlay', type: 'float' }
            ]
        };
        const bindings = buildTextureBindings({ image: source('a'), overlay: source('b') });
        const augmented = augmentConfigWithSamplers(userConfig, bindings);

        expect(augmented.uniforms).toEqual(userConfig.uniforms);
        expect(augmented.uniforms.find(u => u.name === 'u_overlay')).toEqual({ name: 'u_overlay', type: 'float' });
        expect(augmented).toBe(userConfig);
    });

    it('does not mutate the input config', () => {
        const bindings = buildTextureBindings({ image: source('a') });
        const before = baseConfig.uniforms.length;
        augmentConfigWithSamplers(baseConfig, bindings);

        expect(baseConfig.uniforms).toHaveLength(before);
    });

    it('produces a deterministic uniform order across identical inputs', () => {
        const first = augmentConfigWithSamplers(baseConfig, buildTextureBindings({ a: source('1'), b: source('2') }));
        const second = augmentConfigWithSamplers(baseConfig, buildTextureBindings({ a: source('1'), b: source('2') }));

        expect(first.uniforms).toEqual(second.uniforms);
    });
});
