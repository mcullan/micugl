import { beforeEach, describe, expect, it } from 'vitest';

import type { WebGLManager } from '@/core/managers/WebGLManager';
import type { PostProcessEffect } from '@/core/systems/Postprocessing';
import { Postprocessing } from '@/core/systems/Postprocessing';
import type { ShaderProgramConfig } from '@/types';

const SHADER_CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: []
};

function createManagerStub(): WebGLManager {
    const resources = new Map<string, object>();

    const stub = {
        resources,
        createProgram: (id: string): void => { resources.set(id, {}) },
        destroy: (id: string): void => { resources.delete(id) },
        fbo: {
            createFramebuffer: (): void => undefined,
            destroy: (): void => undefined
        }
    };

    return stub as unknown as WebGLManager;
}

function makeEffect(id: string, enabled: boolean): PostProcessEffect {
    return {
        id,
        programId: `${id}-program`,
        shaderConfig: SHADER_CONFIG,
        uniforms: {},
        enabled
    };
}

describe('Postprocessing pass caching', () => {
    let post: Postprocessing;
    let blur: PostProcessEffect;
    let bloom: PostProcessEffect;

    beforeEach(() => {
        post = new Postprocessing(createManagerStub());
        blur = makeEffect('blur', true);
        bloom = makeEffect('bloom', true);
        post.registerEffect(blur);
        post.registerEffect(bloom);
        post.createChain('chain', ['blur', 'bloom'], 'input', null);
    });

    it('returns the same cached array across calls when nothing changes', () => {
        const first = post.generatePasses('chain', 0);
        const second = post.generatePasses('chain', 1);
        expect(second).toBe(first);
        expect(first).toHaveLength(2);
    });

    it('rebuilds when an effect is toggled off, then differs again when toggled back on', () => {
        const enabled = post.generatePasses('chain', 0);

        bloom.enabled = false;

        const oneEffect = post.generatePasses('chain', 0);
        expect(oneEffect).not.toBe(enabled);
        expect(oneEffect).toHaveLength(1);

        bloom.enabled = true;
        const bothAgain = post.generatePasses('chain', 0);
        expect(bothAgain).not.toBe(enabled);
        expect(bothAgain).toHaveLength(2);

        blur.enabled = false;
        bloom.enabled = false;
        const copyOnly = post.generatePasses('chain', 0);
        expect(copyOnly).toHaveLength(1);
        expect(copyOnly[0].programId).toBe('copy-shader');
    });

    it('invalidates the cache when a new effect is registered', () => {
        const before = post.generatePasses('chain', 0);
        post.registerEffect(makeEffect('vignette', true));
        const after = post.generatePasses('chain', 0);
        expect(after).not.toBe(before);
    });

    it('throws for an unknown chain', () => {
        expect(() => post.generatePasses('missing', 0)).toThrow(/not found/);
    });
});

describe('Postprocessing removeEffect program lifecycle', () => {
    it('keeps a shared program alive until the last effect using it is removed', () => {
        const manager = createManagerStub();
        const post = new Postprocessing(manager);

        const a: PostProcessEffect = {
            id: 'a', programId: 'shared', shaderConfig: SHADER_CONFIG, uniforms: {}, enabled: true
        };
        const b: PostProcessEffect = {
            id: 'b', programId: 'shared', shaderConfig: SHADER_CONFIG, uniforms: {}, enabled: true
        };

        post.registerEffect(a);
        post.registerEffect(b);
        expect(manager.resources.has('shared')).toBe(true);

        post.removeEffect('a');
        expect(manager.resources.has('shared')).toBe(true);

        post.removeEffect('b');
        expect(manager.resources.has('shared')).toBe(false);
    });
});
