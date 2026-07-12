import { describe, expect, it } from 'vitest';

import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import { createCanvasStub } from '@/testing';
import type { ShaderProgramConfig } from '@/types';

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: []
};

describe('Passes.reset', () => {
    it('clears every texture index of each output framebuffer and restores the null binding', () => {
        const { canvas, calls, reset: resetStub } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('seed', CONFIG);
        manager.fbo.createFramebuffer('fb-a', { width: 4, height: 4, textureCount: 2 });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' });

        resetStub();
        passSystem.reset();

        const clearColorCalls = calls.filter(call => call.name === 'clearColor');
        const clearCalls = calls.filter(call => call.name === 'clear');
        expect(clearColorCalls).toHaveLength(2);
        expect(clearCalls).toHaveLength(2);

        const bindFramebufferCalls = calls.filter(call => call.name === 'bindFramebuffer');
        const lastBind = bindFramebufferCalls[bindFramebufferCalls.length - 1];
        expect(lastBind.args[1]).toBe(null);
    });

    it('clears with the provided color instead of transparent black', () => {
        const { canvas, reset: resetStub, calls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('seed', CONFIG);
        manager.fbo.createFramebuffer('fb-a', { width: 2, height: 2, textureCount: 1 });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' });

        resetStub();
        passSystem.reset([1, 0, 0, 1]);

        const clearColorCall = calls.find(call => call.name === 'clearColor');
        expect(clearColorCall?.args).toEqual([1, 0, 0, 1]);
    });
});

describe('Passes.renderFinalPassTo', () => {
    function setupChain(): { manager: WebGLManager; passSystem: Passes; calls: readonly { name: string }[] } {
        const { canvas, calls } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('seed', CONFIG);
        manager.createProgram('render', CONFIG);
        manager.fbo.createFramebuffer('fb-a', { width: 4, height: 4, textureCount: 2 });
        manager.fbo.createFramebuffer('scratch', { width: 8, height: 8, textureCount: 1 });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' });
        passSystem.addPass({
            programId: 'render',
            inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }],
            outputFramebuffer: null
        });
        passSystem.initializeResources();

        return { manager, passSystem, calls };
    }

    it('renders only the final pass into the target framebuffer, with no texture swaps', () => {
        const { manager, passSystem } = setupChain();
        const readIndexBefore = manager.fbo.getReadIndex('fb-a');

        passSystem.renderFinalPassTo('scratch', 8, 8, 42);

        expect(manager.fbo.getReadIndex('fb-a')).toBe(readIndexBefore);
    });

    it('draws exactly once', () => {
        const { calls, passSystem } = setupChain();

        passSystem.renderFinalPassTo('scratch', 8, 8, 42);

        expect(calls.filter(call => call.name === 'drawArrays')).toHaveLength(1);
    });

    it('throws when the final compiled pass does not target the canvas', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('seed', CONFIG);
        manager.fbo.createFramebuffer('fb-a', { width: 4, height: 4, textureCount: 2 });
        manager.fbo.createFramebuffer('scratch', { width: 8, height: 8, textureCount: 1 });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' });
        passSystem.initializeResources();

        expect(() => { passSystem.renderFinalPassTo('scratch', 8, 8, 0) }).toThrow(/does not render to canvas/);
    });
});

describe('Passes.isTimePure', () => {
    it('delegates to the pure chain-purity check', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('seed', CONFIG);
        manager.fbo.createFramebuffer('fb-a', { width: 4, height: 4, textureCount: 2 });

        const passSystem = new Passes(manager);
        passSystem.addPass({ programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' });

        expect(passSystem.isTimePure()).toBe(true);

        passSystem.addPass({
            programId: 'seed',
            inputTextures: [{ id: 'state', textureUnit: 0, bindingType: 'readwrite' }],
            outputFramebuffer: 'state'
        });

        expect(passSystem.isTimePure()).toBe(false);
    });
});
