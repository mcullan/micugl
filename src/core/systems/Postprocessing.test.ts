import { beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { WebGLManager } from '@/core/managers/WebGLManager';
import type { PostProcessEffect } from '@/core/systems/Postprocessing';
import { Postprocessing } from '@/core/systems/Postprocessing';
import type { GLStubHandle } from '@/testing';
import { createCanvasStub } from '@/testing';
import { uploadsOf } from '@/testing/fixtures';
import type { FramebufferOptions, UniformType } from '@/types';

const WIDTH = 64;
const HEIGHT = 32;

const FRAMEBUFFERS: FramebufferOptions = { width: WIDTH, height: HEIGHT, textureCount: 1 };

const ACTIVE_UNIFORMS: Record<string, UniformType> = {
    u_texture0: 'sampler2D',
    u_amount: 'float'
};

const SHADER_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_texture0: 'sampler2D', u_amount: 'float' }
});

function createManager(): { manager: WebGLManager; stub: GLStubHandle } {
    const stub = createCanvasStub({ activeUniforms: ACTIVE_UNIFORMS });
    const manager = new WebGLManager(stub.canvas);
    manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);
    manager.fbo.createFramebuffer('input', FRAMEBUFFERS);
    return { manager, stub };
}

function makeEffect(id: string, enabled: boolean): PostProcessEffect {
    return {
        id,
        programId: `${id}-program`,
        shaderConfig: SHADER_CONFIG,
        uniforms: { amount: { type: 'float', value: 0.25 } },
        enabled
    };
}

describe('Postprocessing pass caching', () => {
    let post: Postprocessing;
    let blur: PostProcessEffect;
    let bloom: PostProcessEffect;

    beforeEach(() => {
        post = new Postprocessing(createManager().manager);
        blur = makeEffect('blur', true);
        bloom = makeEffect('bloom', true);
        post.registerEffect(blur);
        post.registerEffect(bloom);
        post.createChain('chain', ['blur', 'bloom'], 'input', null, FRAMEBUFFERS);
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
        const { manager } = createManager();
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

describe('the sampler and the effect uniforms Postprocessing uploads for every effect', () => {
    it('reach GL with their real values, once the chain has been built', () => {
        const { manager, stub } = createManager();
        const post = new Postprocessing(manager);

        post.registerEffect(makeEffect('blur', true));
        post.createChain('chain', ['blur'], 'input', null, FRAMEBUFFERS);

        stub.reset();
        post.process('chain', 0);

        expect(uploadsOf(stub, 'u_texture0')).toEqual([0]);
        expect(uploadsOf(stub, 'u_amount')).toEqual([0.25]);
        expect(stub.uniformCalls.some(call => call.location === null)).toBe(false);
    });

    it('throw when the effect shader never declared the sampler, instead of rendering black by accident', () => {
        const { manager } = createManager();
        const post = new Postprocessing(manager);

        post.registerEffect({
            id: 'blur',
            programId: 'blur-program',
            shaderConfig: createShaderConfig({
                vertexShader: 'void main() {}',
                fragmentShader: 'void main() {}',
                uniformNames: { u_amount: 'float' }
            }),
            uniforms: { amount: { type: 'float', value: 0.25 } },
            enabled: true
        });
        post.createChain('chain', ['blur'], 'input', null, FRAMEBUFFERS);

        expect(() => post.generatePasses('chain', 0)).toThrow(/Uniform "u_texture0".*never declared/s);
    });

    it('throw when an effect uniform was never declared by the effect shader', () => {
        const { manager } = createManager();
        const post = new Postprocessing(manager);

        post.registerEffect({
            id: 'blur',
            programId: 'blur-program',
            shaderConfig: createShaderConfig({
                vertexShader: 'void main() {}',
                fragmentShader: 'void main() {}',
                uniformNames: { u_texture0: 'sampler2D' }
            }),
            uniforms: { amount: { type: 'float', value: 0.25 } },
            enabled: true
        });
        post.createChain('chain', ['blur'], 'input', null, FRAMEBUFFERS);

        expect(() => post.generatePasses('chain', 0)).toThrow(/Uniform "u_amount".*never declared/s);
    });
});
