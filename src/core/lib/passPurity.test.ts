import { describe, expect, it } from 'vitest';

import { chainIsTimePure } from '@/core/lib/passPurity';
import { buildPasses } from '@/react/lib/pingPongPasses';
import type { FramebufferOptions, RenderPass, UniformUpdaterDef } from '@/types';

const framebufferOptions: FramebufferOptions = { width: 0, height: 0, textureCount: 2 };
const noUniforms: Record<string, UniformUpdaterDef[]> = { sim: [], render: [] };

describe('chainIsTimePure', () => {
    it('is time-pure for a generated single-iteration chain', () => {
        const { passes } = buildPasses(
            'sim', undefined, 1, noUniforms, noUniforms, framebufferOptions, { clear: true }, undefined
        );

        expect(chainIsTimePure(passes)).toBe(true);
    });

    it('is time-pure for a generated multi-iteration, multi-fbo chain', () => {
        const { passes } = buildPasses(
            'sim', undefined, 4, noUniforms, noUniforms, framebufferOptions, { clear: true }, undefined
        );

        expect(chainIsTimePure(passes)).toBe(true);
    });

    it('is time-pure for a generated chain with a secondary program', () => {
        const { passes } = buildPasses(
            'sim', 'render', 3, noUniforms, noUniforms, framebufferOptions, { clear: true }, undefined
        );

        expect(chainIsTimePure(passes)).toBe(true);
    });

    it('is stateful for a readwrite self-feedback accumulator', () => {
        const passes: RenderPass[] = [{
            programId: 'sim',
            inputTextures: [{ id: 'state', textureUnit: 0, bindingType: 'readwrite' }],
            outputFramebuffer: 'state'
        }];

        expect(chainIsTimePure(passes)).toBe(false);
    });

    it('is stateful when a pass reads an id before anything writes it', () => {
        const passes: RenderPass[] = [{
            programId: 'render',
            inputTextures: [{ id: 'never-written', textureUnit: 0, bindingType: 'read' }],
            outputFramebuffer: null
        }];

        expect(chainIsTimePure(passes)).toBe(false);
    });

    it('is stateful when the first write to an id has clear:false', () => {
        const passes: RenderPass[] = [
            {
                programId: 'seed',
                inputTextures: [],
                outputFramebuffer: 'fb-a',
                renderOptions: { clear: false }
            },
            {
                programId: 'render',
                inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read' }],
                outputFramebuffer: null
            }
        ];

        expect(chainIsTimePure(passes)).toBe(false);
    });

    it('allows reading an id that was already written earlier in the same frame', () => {
        const passes: RenderPass[] = [
            { programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' },
            {
                programId: 'render',
                inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read' }],
                outputFramebuffer: null
            }
        ];

        expect(chainIsTimePure(passes)).toBe(true);
    });

    it('is stateful when a later non-clearing write follows an earlier clearing write to the same id', () => {
        const passes: RenderPass[] = [
            { programId: 'seed', inputTextures: [], outputFramebuffer: 'fb-a' },
            {
                programId: 'accumulate',
                inputTextures: [],
                outputFramebuffer: 'fb-a',
                renderOptions: { clear: false }
            },
            {
                programId: 'render',
                inputTextures: [{ id: 'fb-a', textureUnit: 0, bindingType: 'read' }],
                outputFramebuffer: null
            }
        ];

        expect(chainIsTimePure(passes)).toBe(false);
    });
});
