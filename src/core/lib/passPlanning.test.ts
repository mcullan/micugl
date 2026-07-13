import { describe, expect, it } from 'vitest';

import { compilePass, planPassSwaps } from '@/core/lib/passPlanning';
import type { RenderPass } from '@/types';

const allPingPong = (): boolean => true;

describe('planPassSwaps', () => {
    it('swaps the output framebuffer once for a read-input ping-pong pass', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }],
            outputFramebuffer: 'fb-b'
        };

        expect(planPassSwaps(pass, allPingPong)).toEqual(['fb-b']);
    });

    it('swaps a readwrite self-feedback framebuffer exactly once, not twice', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [{ id: 'state', textureUnit: 0, bindingType: 'readwrite', samplerName: 'u_texture0' }],
            outputFramebuffer: 'state'
        };

        expect(planPassSwaps(pass, allPingPong)).toEqual(['state']);
    });

    it('swaps output and a distinct readwrite input separately', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [{ id: 'feedback', textureUnit: 1, bindingType: 'readwrite', samplerName: 'u_texture1' }],
            outputFramebuffer: 'target'
        };

        expect(planPassSwaps(pass, allPingPong)).toEqual(['target', 'feedback']);
    });

    it('does not swap non-ping-pong ids', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [{ id: 'state', textureUnit: 0, bindingType: 'readwrite', samplerName: 'u_texture0' }],
            outputFramebuffer: 'state'
        };

        expect(planPassSwaps(pass, () => false)).toEqual([]);
    });

    it('does not swap when rendering to the screen', () => {
        const pass: RenderPass = {
            programId: 'render',
            inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }],
            outputFramebuffer: null
        };

        expect(planPassSwaps(pass, allPingPong)).toEqual([]);
    });
});

describe('compilePass', () => {
    it('carries the sampler name of each binding through, independent of the framebuffer id', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [
                { id: 'sim-fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' },
                { id: 'noise', textureUnit: 1, bindingType: 'read', samplerName: 'u_noise' }
            ],
            outputFramebuffer: null
        };

        const compiled = compilePass(pass, allPingPong);
        expect(compiled.inputs.map(input => input.samplerName)).toEqual(['u_texture0', 'u_noise']);
    });

    it('flattens pass uniforms into an ordered entry array once', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [],
            outputFramebuffer: null,
            uniforms: {
                u_damping: { type: 'float', value: 0.9 },
                u_color: { type: 'vec3', value: () => new Float32Array([1, 0, 0]) as never }
            }
        };

        const compiled = compilePass(pass, allPingPong);
        expect(compiled.uniforms.map(u => u.name)).toEqual(['u_damping', 'u_color']);
        expect(typeof compiled.uniforms[1].value).toBe('function');
    });

    it('precomputes read/write index selection per binding type', () => {
        const pass: RenderPass = {
            programId: 'sim',
            inputTextures: [
                { id: 'a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' },
                { id: 'b', textureUnit: 1, bindingType: 'write', samplerName: 'u_texture1' },
                { id: 'c', textureUnit: 2, bindingType: 'readwrite', samplerName: 'u_texture2' }
            ],
            outputFramebuffer: null
        };

        const compiled = compilePass(pass, allPingPong);
        expect(compiled.inputs.map(i => i.pingPongUseReadIndex)).toEqual([true, false, true]);
        expect(compiled.inputs.map(i => i.staticIndex)).toEqual([0, 1, 1]);
    });
});
