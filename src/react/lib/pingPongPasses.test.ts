import { describe, expect, it } from 'vitest';

import { vec3 } from '@/core/lib/vectorUtils';
import {
    buildPasses,
    serializeFramebufferOptions,
    serializeRenderOptions
} from '@/react/lib/pingPongPasses';
import type { FramebufferOptions, UniformUpdaterDef } from '@/types';

const makeFramebufferOptions = (overrides: Partial<FramebufferOptions> = {}): FramebufferOptions => ({
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: { minFilter: 9729, magFilter: 9729 },
    ...overrides
});

const primary: Record<string, UniformUpdaterDef[]> = {
    sim: [{ name: 'u_strength', type: 'float', updateFn: () => 1 }]
};
const secondary: Record<string, UniformUpdaterDef[]> = {
    render: [{ name: 'u_color', type: 'vec3', updateFn: () => vec3([1, 2, 3]) }]
};
const renderOptions = { clear: true };

describe('serializeFramebufferOptions', () => {
    it('is stable across re-created but identical option objects', () => {
        expect(serializeFramebufferOptions(makeFramebufferOptions()))
            .toBe(serializeFramebufferOptions(makeFramebufferOptions()));
    });

    it('changes when dimensions change', () => {
        expect(serializeFramebufferOptions(makeFramebufferOptions()))
            .not.toBe(serializeFramebufferOptions(makeFramebufferOptions({ width: 256, height: 256 })));
    });

    it('treats an omitted textureCount as the default of 2', () => {
        expect(serializeFramebufferOptions(makeFramebufferOptions({ textureCount: 2 })))
            .toBe(serializeFramebufferOptions(makeFramebufferOptions({ textureCount: undefined })));
    });

    it('produces a JSON string that round-trips', () => {
        const key = serializeFramebufferOptions(makeFramebufferOptions({ width: 128, height: 64 }));
        expect(JSON.parse(key)).toEqual({
            width: 128,
            height: 64,
            textureCount: 2,
            textureOptions: { minFilter: 9729, magFilter: 9729 }
        });
    });
});

describe('serializeRenderOptions', () => {
    it('normalizes an omitted clearColor to opaque black', () => {
        expect(serializeRenderOptions({ clear: true }))
            .toBe(serializeRenderOptions({ clear: true, clearColor: [0, 0, 0, 1] }));
    });

    it('changes when clearColor changes', () => {
        expect(serializeRenderOptions({ clear: true }))
            .not.toBe(serializeRenderOptions({ clear: true, clearColor: [1, 0, 0, 1] }));
    });
});

describe('buildPasses', () => {
    it('emits an init pass, one pass per iteration, and a final screen pass', () => {
        const { passes } = buildPasses(
            'sim', undefined, 3, primary, {}, makeFramebufferOptions(), renderOptions, undefined
        );

        expect(passes).toHaveLength(1 + 3 + 1);
        expect(passes[0].outputFramebuffer).toBe('sim-fb-a');
        expect(passes[passes.length - 1].outputFramebuffer).toBeNull();
    });

    it('exposes two ping-pong framebuffers keyed on the primary program id', () => {
        const { framebuffers } = buildPasses(
            'sim', undefined, 1, primary, {}, makeFramebufferOptions(), renderOptions, undefined
        );

        expect(Object.keys(framebuffers)).toEqual(['sim-fb-a', 'sim-fb-b']);
    });

    it('alternates to the secondary program on odd iterations and for the final pass', () => {
        const { passes } = buildPasses(
            'sim', 'render', 2, primary, secondary, makeFramebufferOptions(), renderOptions, undefined
        );

        expect(passes.map(p => p.programId)).toEqual(['sim', 'sim', 'render', 'render']);
    });

    it('carries the live updater function through as the pass uniform value', () => {
        const { passes } = buildPasses(
            'sim', undefined, 1, primary, {}, makeFramebufferOptions(), renderOptions, undefined
        );

        const iterationPass = passes[1];
        expect(typeof iterationPass.uniforms?.u_strength.value).toBe('function');
    });

    it('passes custom passes through untouched', () => {
        const custom = [{
            programId: 'sim',
            inputTextures: [],
            outputFramebuffer: null
        }];

        const { passes } = buildPasses(
            'sim', undefined, 4, primary, {}, makeFramebufferOptions(), renderOptions, custom
        );

        expect(passes).toBe(custom);
    });
});
