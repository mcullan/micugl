import { describe, expect, it } from 'vitest';

import {
    framebuffersContentKey,
    instancingContentKey,
    programConfigContentKey,
    programConfigsContentKey,
    singleProgramEntry
} from '@/react/lib/contentKeys';
import type { FramebufferOptions, InstancingConfig, ShaderProgramConfig } from '@/types';

const makeConfig = (overrides: Partial<ShaderProgramConfig> = {}): ShaderProgramConfig => ({
    vertexShader: 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }',
    fragmentShader: 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }',
    uniforms: [
        { name: 'u_time', type: 'float' },
        { name: 'u_resolution', type: 'vec2' }
    ],
    ...overrides
});

const makeFramebufferOptions = (overrides: Partial<FramebufferOptions> = {}): FramebufferOptions => ({
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: { minFilter: 9729, magFilter: 9729 },
    ...overrides
});

describe('programConfigsContentKey', () => {
    it('is stable across re-created but identical config objects', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({ main: makeConfig() });

        expect(a).toBe(b);
    });

    it('changes when the fragment shader source changes', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({
            main: makeConfig({ fragmentShader: 'precision mediump float; void main() { gl_FragColor = vec4(0.0); }' })
        });

        expect(a).not.toBe(b);
    });

    it('changes when the vertex shader source changes', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({
            main: makeConfig({ vertexShader: 'void main() { gl_Position = vec4(0.0); }' })
        });

        expect(a).not.toBe(b);
    });

    it('changes when the program id changes', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({ other: makeConfig() });

        expect(a).not.toBe(b);
    });

    it('changes when the uniform declarations change', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({
            main: makeConfig({ uniforms: [{ name: 'u_time', type: 'float' }] })
        });

        expect(a).not.toBe(b);
    });

    it('changes when the attribute declarations change', () => {
        const a = programConfigsContentKey({ main: makeConfig() });
        const b = programConfigsContentKey({
            main: makeConfig({
                attributes: [{
                    name: 'a_position', size: 2, type: 'FLOAT',
                    normalized: false, stride: 0, offset: 0
                }]
            })
        });

        expect(a).not.toBe(b);
    });

    it('distinguishes multi-program records entry by entry', () => {
        const primary = makeConfig();
        const secondary = makeConfig({ fragmentShader: 'void main() { gl_FragColor = vec4(0.5); }' });

        const a = programConfigsContentKey({ sim: primary, render: secondary });
        const b = programConfigsContentKey({ sim: primary, render: secondary });
        const c = programConfigsContentKey({ sim: primary, render: makeConfig() });

        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});

describe('programConfigContentKey', () => {
    it('matches the record key for a single entry', () => {
        const config = makeConfig();

        expect(programConfigContentKey('main', config))
            .toBe(programConfigsContentKey({ main: config }));
    });

    it('treats omitted attributes as an empty array', () => {
        const omitted = programConfigContentKey('main', makeConfig({ attributes: undefined }));
        const empty = programConfigContentKey('main', makeConfig({ attributes: [] }));

        expect(omitted).toBe(empty);
    });
});

describe('singleProgramEntry', () => {
    it('returns the id and config of the single entry', () => {
        const config = makeConfig();
        const [id, entry] = singleProgramEntry({ main: config });

        expect(id).toBe('main');
        expect(entry).toBe(config);
    });

    it('throws on an empty record', () => {
        expect(() => singleProgramEntry({})).toThrow('exactly one entry in programConfigs, received 0');
    });

    it('throws when more than one program config is provided', () => {
        expect(() => singleProgramEntry({ a: makeConfig(), b: makeConfig() }))
            .toThrow('exactly one entry in programConfigs, received 2');
    });
});

describe('framebuffersContentKey', () => {
    it('is stable across re-created but identical records', () => {
        const a = framebuffersContentKey({ 'fb-a': makeFramebufferOptions(), 'fb-b': makeFramebufferOptions() });
        const b = framebuffersContentKey({ 'fb-a': makeFramebufferOptions(), 'fb-b': makeFramebufferOptions() });

        expect(a).toBe(b);
    });

    it('treats an omitted textureCount as the default of 2', () => {
        const explicit = framebuffersContentKey({ fb: makeFramebufferOptions({ textureCount: 2 }) });
        const omitted = framebuffersContentKey({ fb: makeFramebufferOptions({ textureCount: undefined }) });

        expect(explicit).toBe(omitted);
    });

    it('changes when dimensions change', () => {
        const a = framebuffersContentKey({ fb: makeFramebufferOptions() });
        const b = framebuffersContentKey({ fb: makeFramebufferOptions({ width: 256, height: 256 }) });

        expect(a).not.toBe(b);
    });

    it('changes when texture options change', () => {
        const a = framebuffersContentKey({ fb: makeFramebufferOptions() });
        const b = framebuffersContentKey({
            fb: makeFramebufferOptions({ textureOptions: { minFilter: 9728, magFilter: 9728 } })
        });

        expect(a).not.toBe(b);
    });

    it('changes when the framebuffer id changes', () => {
        const a = framebuffersContentKey({ 'fb-a': makeFramebufferOptions() });
        const b = framebuffersContentKey({ 'fb-b': makeFramebufferOptions() });

        expect(a).not.toBe(b);
    });

    it('treats omitted textureOptions as an empty object', () => {
        const omitted = framebuffersContentKey({ fb: makeFramebufferOptions({ textureOptions: undefined }) });
        const empty = framebuffersContentKey({ fb: makeFramebufferOptions({ textureOptions: {} }) });

        expect(omitted).toBe(empty);
    });

    it('is empty for an undefined record', () => {
        expect(framebuffersContentKey(undefined)).toBe('');
    });
});

describe('instancingContentKey', () => {
    const makeInstancing = (overrides: Partial<InstancingConfig> = {}): InstancingConfig => ({
        instanceCount: 10,
        attributes: {
            a_offset: { data: new Float32Array([0, 0]), size: 2, usage: 'dynamic' }
        },
        ...overrides
    });

    it('is empty for an undefined config', () => {
        expect(instancingContentKey(undefined)).toBe('');
    });

    it('is stable across re-created but structurally identical configs', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing());

        expect(a).toBe(b);
    });

    it('is stable across different instanceCount values (number vs function)', () => {
        const a = instancingContentKey(makeInstancing({ instanceCount: 10 }));
        const b = instancingContentKey(makeInstancing({ instanceCount: () => 999 }));

        expect(a).toBe(b);
    });

    it('is stable across different attribute data (data is excluded)', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: { a_offset: { data: new Float32Array([9, 9, 9, 9]), size: 2, usage: 'dynamic' } }
        }));

        expect(a).toBe(b);
    });

    it('changes when an attribute size changes', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: { a_offset: { data: new Float32Array([0, 0, 0]), size: 3, usage: 'dynamic' } }
        }));

        expect(a).not.toBe(b);
    });

    it('changes when usage changes', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: { a_offset: { data: new Float32Array([0, 0]), size: 2, usage: 'static' } }
        }));

        expect(a).not.toBe(b);
    });

    it('changes when normalized changes', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: { a_offset: { data: new Float32Array([0, 0]), size: 2, usage: 'dynamic', normalized: true } }
        }));

        expect(a).not.toBe(b);
    });

    it('changes when capacity changes', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: { a_offset: { data: new Float32Array([0, 0]), size: 2, usage: 'dynamic', capacity: 500 } }
        }));

        expect(a).not.toBe(b);
    });

    it('changes when an attribute is added or removed', () => {
        const a = instancingContentKey(makeInstancing());
        const b = instancingContentKey(makeInstancing({
            attributes: {
                a_offset: { data: new Float32Array([0, 0]), size: 2, usage: 'dynamic' },
                a_color: { data: new Float32Array([1, 1, 1]), size: 3 }
            }
        }));

        expect(a).not.toBe(b);
    });

    it('is independent of attribute declaration order', () => {
        const a = instancingContentKey(makeInstancing({
            attributes: {
                a_offset: { data: new Float32Array([0, 0]), size: 2 },
                a_color: { data: new Float32Array([1, 1, 1]), size: 3 }
            }
        }));
        const b = instancingContentKey(makeInstancing({
            attributes: {
                a_color: { data: new Float32Array([1, 1, 1]), size: 3 },
                a_offset: { data: new Float32Array([0, 0]), size: 2 }
            }
        }));

        expect(a).toBe(b);
    });
});
