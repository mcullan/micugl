import { describe, expect, it } from 'vitest';

import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import { buildFeedbackPasses } from '@/react/lib/pingPongPasses';
import { createCanvasStub } from '@/testing';
import type { FramebufferOptions, ShaderProgramConfig, UniformUpdaterDef } from '@/types';

const NO_UPDATERS: Record<string, UniformUpdaterDef[]> = { 'sim': [], 'render': [] };

const BYTE_FBO: FramebufferOptions = { width: 4, height: 4, textureCount: 1 };
const RENDER_OPTIONS = { clear: true };

const SAMPLER_CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: [{ name: 'u_texture0', type: 'sampler2D' }]
};

describe('buildFeedbackPasses shape (T1)', () => {
    it('emits iterations readwrite sim passes into one feedback buffer, then one read render pass', () => {
        const result = buildFeedbackPasses('sim', 'render', 2, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS);

        expect(result.passes).toHaveLength(3);

        for (const simPass of result.passes.slice(0, 2)) {
            expect(simPass.programId).toBe('sim');
            expect(simPass.outputFramebuffer).toBe('sim-feedback');
            expect(simPass.inputTextures).toHaveLength(1);
            expect(simPass.inputTextures[0].bindingType).toBe('readwrite');
            expect(simPass.inputTextures[0].id).toBe('sim-feedback');
            expect(simPass.inputTextures[0].samplerName).toBe('u_texture0');
            expect(simPass.renderOptions?.clear).toBe(false);
        }

        const renderPass = result.passes[2];
        expect(renderPass.programId).toBe('render');
        expect(renderPass.outputFramebuffer).toBeNull();
        expect(renderPass.inputTextures[0].bindingType).toBe('read');
        expect(renderPass.inputTextures[0].id).toBe('sim-feedback');
        expect(renderPass.renderOptions?.clear).toBe(true);
    });

    it('forces the feedback framebuffer to textureCount 2 even when the caller asks for 1', () => {
        const result = buildFeedbackPasses('sim', 'render', 1, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS);
        expect(result.framebuffers['sim-feedback'].textureCount).toBe(2);
    });

    it('throws without a secondary program id', () => {
        expect(() => buildFeedbackPasses('sim', undefined, 1, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS))
            .toThrow(/secondaryProgramId/);
    });

    it('throws when iterations is below 1', () => {
        expect(() => buildFeedbackPasses('sim', 'render', 0, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS))
            .toThrow(/iterations must be at least 1/);
    });
});

describe('feedback cross-frame plumbing through the real swap/index code (T3)', () => {
    it('the sim writes a different texture index than it reads, and the render reads the sim last write', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('sim', SAMPLER_CONFIG);
        manager.createProgram('render', SAMPLER_CONFIG);

        const result = buildFeedbackPasses('sim', 'render', 1, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS);
        Object.entries(result.framebuffers).forEach(([id, options]) => {
            manager.fbo.createFramebuffer(id, options);
        });

        const passSystem = new Passes(manager);
        result.passes.forEach(pass => { passSystem.addPass(pass) });
        passSystem.initializeResources();

        expect(manager.fbo.getTextureCount('sim-feedback')).toBe(2);

        const reads: number[] = [];
        const writes: number[] = [];
        const fbo = manager.fbo;
        const originalBindTexture = fbo.bindTexture.bind(fbo);
        const originalBindFramebuffer = fbo.bindFramebuffer.bind(fbo);
        fbo.bindTexture = (id: string, unit: number, index?: number): void => {
            if (id === 'sim-feedback' && index !== undefined) {
                reads.push(index);
            }
            originalBindTexture(id, unit, index);
        };
        fbo.bindFramebuffer = (id: string | null, index?: number): void => {
            if (id === 'sim-feedback' && index !== undefined) {
                writes.push(index);
            }
            originalBindFramebuffer(id, index);
        };

        passSystem.execute(0, 4, 4);

        expect(writes).toHaveLength(1);
        expect(reads).toHaveLength(2);
        expect(writes[0]).not.toBe(reads[0]);
        expect(reads[1]).toBe(writes[0]);
    });

    it('swaps the feedback buffer once per execute so the accumulator advances frame to frame', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('sim', SAMPLER_CONFIG);
        manager.createProgram('render', SAMPLER_CONFIG);

        const result = buildFeedbackPasses('sim', 'render', 1, NO_UPDATERS, NO_UPDATERS, BYTE_FBO, RENDER_OPTIONS);
        Object.entries(result.framebuffers).forEach(([id, options]) => {
            manager.fbo.createFramebuffer(id, options);
        });

        const passSystem = new Passes(manager);
        result.passes.forEach(pass => { passSystem.addPass(pass) });
        passSystem.initializeResources();

        const readIndex0 = manager.fbo.getReadIndex('sim-feedback');
        passSystem.execute(0, 4, 4);
        const readIndex1 = manager.fbo.getReadIndex('sim-feedback');
        passSystem.execute(16, 4, 4);
        const readIndex2 = manager.fbo.getReadIndex('sim-feedback');

        expect(readIndex1).not.toBe(readIndex0);
        expect(readIndex2).toBe(readIndex0);
    });
});
