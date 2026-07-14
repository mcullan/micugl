import { describe, expect, it } from 'vitest';

import { vec2, vec3 } from '@/core';
import {
    buildLiveUpdaters,
    collectLiveValues,
    normalizeUniformParams,
    uniformDescriptors
} from '@/react/lib/liveUniformUpdaters';
import {
    buildPasses,
    DEFAULT_FRAMEBUFFER_OPTIONS,
    DEFAULT_RENDER_OPTIONS
} from '@/react/lib/pingPongPasses';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import type { WorkerBlockInputs } from '@/react/lib/workerMode';
import {
    collectWorkerValues,
    findWorkerBlock,
    isWorkerRequested,
    normalizeLiveUniformNames,
    normalizeWorkerPrograms,
    resolveWorkerMode,
    sampleLiveUniforms,
    stripPassUniforms,
    transferCanvasToWorker,
    workerBlockMessage,
    workerPingPongUniforms
} from '@/react/lib/workerMode';
import type { RenderPass, UniformParam, UniformUpdaterDef } from '@/types';
import { isWorkerBuiltinUniformName } from '@/worker/protocol';

const PROGRAM_ID = 'sim';
const SECONDARY_PROGRAM_ID = 'sim-secondary';

function simUniforms(): Record<string, UniformParam> {
    return {
        intensity: { type: 'float', value: 0.5 },
        color1: { type: 'vec3', value: vec3([1, 0, 0]) }
    };
}

function realUpdaters(programId: string, uniforms: Record<string, UniformParam>): Record<string, UniformUpdaterDef[]> {
    const valuesRef = { current: collectLiveValues(uniforms) };
    const runtime = createTransitionRuntime(() => false);
    return { [programId]: buildLiveUpdaters(uniformDescriptors(uniforms), false, valuesRef, runtime) };
}

function realPasses(uniforms = simUniforms()): RenderPass[] {
    return buildPasses(
        PROGRAM_ID,
        undefined,
        1,
        realUpdaters(PROGRAM_ID, uniforms),
        {},
        DEFAULT_FRAMEBUFFER_OPTIONS,
        DEFAULT_RENDER_OPTIONS,
        undefined
    ).passes;
}

function blockInputs(overrides: Partial<WorkerBlockInputs> = {}): WorkerBlockInputs {
    return {
        uniforms: { [PROGRAM_ID]: normalizeUniformParams(simUniforms()) },
        fastPath: true,
        instancing: false,
        textures: false,
        ...overrides
    };
}

describe('resolveWorkerMode', () => {
    it('leaves worker mode off unless it was asked for', () => {
        expect(resolveWorkerMode(undefined, true, false)).toBe(false);
        expect(resolveWorkerMode(false, true, false)).toBe(false);
        expect(isWorkerRequested(undefined)).toBe(false);
        expect(isWorkerRequested(false)).toBe(false);
        expect(isWorkerRequested(true)).toBe(true);
        expect(isWorkerRequested('auto')).toBe(true);
    });

    it('honours worker={true} even when blocked, so the block throws instead of downgrading silently', () => {
        expect(resolveWorkerMode(true, true, false)).toBe(true);
        expect(resolveWorkerMode(true, true, true)).toBe(true);
    });

    it('keeps worker={true} on in an unsupported environment, leaving the logged fallback to createMicuglWorker', () => {
        expect(resolveWorkerMode(true, false, false)).toBe(true);
    });

    it('downgrades worker="auto" to the main thread when unsupported or blocked, and never throws', () => {
        expect(resolveWorkerMode('auto', true, false)).toBe(true);
        expect(resolveWorkerMode('auto', false, false)).toBe(false);
        expect(resolveWorkerMode('auto', true, true)).toBe(false);
        expect(resolveWorkerMode('auto', false, true)).toBe(false);
    });
});

describe('uniform name normalization at the worker boundary', () => {
    it('prefixes bare names exactly the way the main-thread updaters do', () => {
        expect(normalizeUniformParams(simUniforms())).toEqual({
            u_intensity: { type: 'float', value: 0.5 },
            u_color1: { type: 'vec3', value: vec3([1, 0, 0]) }
        });
    });

    it('normalizes the names the main-thread descriptors would use, and is idempotent', () => {
        const descriptorNames = uniformDescriptors(simUniforms()).map(descriptor => descriptor.name);
        const workerNames = Object.keys(normalizeUniformParams(simUniforms()));

        expect(workerNames).toEqual(descriptorNames);
        expect(Object.keys(normalizeUniformParams(normalizeUniformParams(simUniforms())))).toEqual(workerNames);
    });

    it('normalizes the liveUniforms name list', () => {
        expect(normalizeLiveUniformNames(['mouse', 'u_scroll'])).toEqual(['u_mouse', 'u_scroll']);
        expect(normalizeLiveUniformNames(undefined)).toEqual([]);
    });

    it('normalizes every program in a multi-program map', () => {
        expect(normalizeWorkerPrograms({
            [PROGRAM_ID]: { intensity: { type: 'float', value: 1 } },
            [SECONDARY_PROGRAM_ID]: { u_blur: { type: 'float', value: 2 } }
        })).toEqual({
            [PROGRAM_ID]: { u_intensity: { type: 'float', value: 1 } },
            [SECONDARY_PROGRAM_ID]: { u_blur: { type: 'float', value: 2 } }
        });
    });
});

describe('findWorkerBlock: one list of the reasons a worker cannot run this component', () => {
    it('finds nothing for a component the worker can run', () => {
        expect(findWorkerBlock(blockInputs())).toBeNull();
    });

    it('blocks a component whose worker uniforms were never handed over', () => {
        expect(findWorkerBlock(blockInputs({ uniforms: undefined })))
            .toEqual({ kind: 'uniforms-missing' });
        expect(workerBlockMessage('ShaderEngine', { kind: 'uniforms-missing' })).toMatch(/workerUniforms/);
    });

    it('blocks a custom renderCallback, which only the main thread can call', () => {
        expect(findWorkerBlock(blockInputs({ fastPath: false }))).toEqual({ kind: 'fast-path' });
        expect(workerBlockMessage('ShaderEngine', { kind: 'fast-path' })).toMatch(/useFastPath/);
    });

    it('blocks instancing in the render body, instead of letting the bridge throw after the worker spawns', () => {
        expect(findWorkerBlock(blockInputs({ instancing: true }))).toEqual({ kind: 'instancing' });
        expect(workerBlockMessage('ShaderEngine', { kind: 'instancing' })).toMatch(/instancing/);
    });

    it('blocks texture sources in the render body, and names the prop, graph nodes and both remedies', () => {
        expect(findWorkerBlock(blockInputs({ textures: true }))).toEqual({ kind: 'textures' });
        const message = workerBlockMessage('BaseShaderComponent', { kind: 'textures' });
        expect(message).toMatch(/"textures"/);
        expect(message).toMatch(/shader graph node/);
        expect(message).toMatch(/Remove the texture sources/);
        expect(message).toMatch(/turn off worker mode/);
    });

    it('blocks a function uniform that is neither a built-in nor a live uniform', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } }
        }));

        expect(block).toEqual({ kind: 'uniform-function', programId: PROGRAM_ID, name: 'u_mouse' });
        expect(workerBlockMessage('ShaderEngine', block!)).toMatch(/liveUniforms/);
    });

    it('exempts a function uniform that is listed in liveUniforms for that program', () => {
        expect(findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } },
            liveUniforms: { programId: PROGRAM_ID, names: ['u_mouse'] }
        }))).toBeNull();

        expect(findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_mouse: { type: 'vec2', value: () => vec2([0, 0]) } } },
            liveUniforms: { programId: SECONDARY_PROGRAM_ID, names: ['u_mouse'] }
        }))).not.toBeNull();
    });

    it('blocks a function-valued built-in, which the worker would compute itself and silently ignore', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_time: { type: 'float', value: (time = 0) => time * 0.002 } } }
        }));

        expect(block).toEqual({ kind: 'uniform-builtin-function', programId: PROGRAM_ID, name: 'u_time' });
        expect(workerBlockMessage('ShaderEngine', block!)).toMatch(/plain value/);
    });

    it('blocks a function-valued built-in even when it is listed in liveUniforms', () => {
        expect(findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_time: { type: 'float', value: (time = 0) => time } } },
            liveUniforms: { programId: PROGRAM_ID, names: ['u_time'] }
        }))).toEqual({ kind: 'uniform-builtin-function', programId: PROGRAM_ID, name: 'u_time' });
    });

    it('accepts a plain-value built-in, which the worker prefers over its own clock', () => {
        expect(findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_time: { type: 'float', value: 0 } } }
        }))).toBeNull();
    });

    it('blocks a uniform value that structured clone cannot carry, instead of throwing from the bridge', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: { u_flag: { type: 'float', value: 'on' as unknown as number } } }
        }));

        expect(block).toEqual({ kind: 'uniform-not-clone-safe', programId: PROGRAM_ID, name: 'u_flag' });
        expect(workerBlockMessage('ShaderEngine', block!)).toMatch(/structured-clone-safe/);
    });

    it('blocks a uniform with a "transition", which would silently be ignored by the worker', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: {
                [PROGRAM_ID]: {
                    u_swirl: { type: 'float', value: 0, transition: { duration: 300 } }
                }
            }
        }));

        expect(block).toEqual({ kind: 'uniform-transition', programId: PROGRAM_ID, name: 'u_swirl' });
        const message = workerBlockMessage('ShaderEngine', block!);
        expect(message).toMatch(/u_swirl/);
        expect(message).toMatch(/transition/);
    });

    it('blocks an unknown liveUniforms name in the render body, not from inside the sampler loop', () => {
        const block = findWorkerBlock(blockInputs({
            liveUniforms: { programId: PROGRAM_ID, names: ['u_ghost'] }
        }));

        expect(block).toEqual({ kind: 'live-uniform-unknown', name: 'u_ghost' });
        expect(workerBlockMessage('ShaderEngine', block!)).toMatch(/u_ghost/);
    });
});

describe('findWorkerBlock: render passes', () => {
    it('lets the auto ping-pong passes through, because the engine strips their uniforms for the worker', () => {
        const passes = stripPassUniforms(realPasses());

        expect(passes).toHaveLength(3);
        for (const pass of passes) {
            expect(pass.uniforms).toBeUndefined();
        }
        expect(findWorkerBlock(blockInputs({ passes }))).toBeNull();
    });

    it('keeps the structure of the auto passes identical apart from the uniforms', () => {
        const withUniforms = realPasses().map(({ uniforms: _uniforms, ...rest }) => rest);

        expect(stripPassUniforms(realPasses())).toEqual(withUniforms);
    });

    it('gives the seed pass the same uniforms as the other passes, so the worker cannot diverge from main', () => {
        const passes = realPasses();
        const names = passes.map(pass => Object.keys(pass.uniforms ?? {}).sort());

        expect(names[0]).toEqual(['u_color1', 'u_intensity', 'u_resolution', 'u_time']);
        expect(names[1]).toEqual(names[0]);
        expect(names[2]).toEqual(names[0]);
    });

    it('leaves no uniform behind: every uniform the main-thread passes apply is a built-in or a posted value', () => {
        const uniforms = simUniforms();
        const mainThreadNames = new Set(
            realPasses(uniforms).flatMap(pass => Object.keys(pass.uniforms ?? {}))
        );
        const posted = normalizeUniformParams(uniforms);

        expect(mainThreadNames).toContain('u_time');
        expect(mainThreadNames).toContain('u_resolution');
        expect(mainThreadNames).toContain('u_intensity');

        for (const name of mainThreadNames) {
            expect(isWorkerBuiltinUniformName(name) || name in posted).toBe(true);
        }
    });

    it('accepts a custom pass whose uniforms are plain values', () => {
        const custom: RenderPass[] = [{
            programId: PROGRAM_ID,
            inputTextures: [],
            outputFramebuffer: null,
            uniforms: { u_amount: { type: 'float', value: 0.25 } }
        }];

        expect(buildPasses(
            PROGRAM_ID,
            undefined,
            1,
            {},
            {},
            DEFAULT_FRAMEBUFFER_OPTIONS,
            DEFAULT_RENDER_OPTIONS,
            custom
        ).passes).toBe(custom);

        expect(findWorkerBlock(blockInputs({ uniforms: { [PROGRAM_ID]: {} }, passes: custom }))).toBeNull();
    });

    it('blocks a function-valued pass uniform', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: {} },
            passes: [{
                programId: PROGRAM_ID,
                inputTextures: [],
                uniforms: { u_amount: { type: 'float', value: () => 1 } }
            }]
        }));

        expect(block).toEqual({
            kind: 'pass-uniform-function',
            programId: PROGRAM_ID,
            passIndex: 0,
            name: 'u_amount'
        });
    });

    it('blocks a function-valued built-in pass uniform, which the worker would silently replace', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: {} },
            passes: [
                { programId: PROGRAM_ID, inputTextures: [] },
                {
                    programId: PROGRAM_ID,
                    inputTextures: [],
                    uniforms: { u_time: { type: 'float', value: (time: number) => time } }
                }
            ]
        }));

        expect(block).toEqual({
            kind: 'pass-uniform-function',
            programId: PROGRAM_ID,
            passIndex: 1,
            name: 'u_time'
        });
        expect(workerBlockMessage('PingPongShaderEngine', block!)).toMatch(/pass 1/);
        expect(workerBlockMessage('PingPongShaderEngine', block!)).toMatch(/u_time/);
    });

    it('blocks a pass uniform that structured clone cannot carry', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: {} },
            passes: [{
                programId: PROGRAM_ID,
                inputTextures: [],
                uniforms: { u_amount: { type: 'float', value: 'loud' as unknown as number } }
            }]
        }));

        expect(block).toEqual({
            kind: 'pass-uniform-not-clone-safe',
            programId: PROGRAM_ID,
            passIndex: 0,
            name: 'u_amount'
        });
    });

    it('blocks a pass that samples a texture source, and explains it with the textures message', () => {
        const block = findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: {} },
            passes: [{
                programId: PROGRAM_ID,
                inputTextures: [
                    { id: 'u_image', textureUnit: 0, bindingType: 'source', samplerName: 'u_image' }
                ],
                outputFramebuffer: null
            }]
        }));

        expect(block).toEqual({ kind: 'textures' });
        expect(workerBlockMessage('BaseShaderComponent', block!)).toMatch(/"textures" prop/);
    });

    it('does not block a pass whose inputs are all framebuffer reads', () => {
        expect(findWorkerBlock(blockInputs({
            uniforms: { [PROGRAM_ID]: {} },
            passes: [{
                programId: PROGRAM_ID,
                inputTextures: [
                    { id: 'fb-a', textureUnit: 0, bindingType: 'read', samplerName: 'u_texture0' }
                ],
                outputFramebuffer: null
            }]
        }))).toBeNull();
    });
});

describe('workerPingPongUniforms', () => {
    it('declares an entry per program, populated from the uniform props', () => {
        expect(workerPingPongUniforms({
            programId: PROGRAM_ID,
            uniforms: simUniforms(),
            secondaryProgramId: SECONDARY_PROGRAM_ID,
            secondaryUniforms: { blur: { type: 'float', value: 2 } },
            customPasses: false
        })).toEqual({
            [PROGRAM_ID]: simUniforms(),
            [SECONDARY_PROGRAM_ID]: { blur: { type: 'float', value: 2 } }
        });
    });

    it('declares an empty entry per program under customPasses, which the main thread also ignores', () => {
        expect(workerPingPongUniforms({
            programId: PROGRAM_ID,
            uniforms: simUniforms(),
            secondaryProgramId: SECONDARY_PROGRAM_ID,
            secondaryUniforms: { blur: { type: 'float', value: 2 } },
            customPasses: true
        })).toEqual({
            [PROGRAM_ID]: {},
            [SECONDARY_PROGRAM_ID]: {}
        });
    });

    it('declares no secondary program when there is no secondary shader', () => {
        expect(workerPingPongUniforms({
            programId: PROGRAM_ID,
            uniforms: simUniforms(),
            customPasses: false
        })).toEqual({ [PROGRAM_ID]: simUniforms() });
    });
});

describe('collectWorkerValues', () => {
    it('collects plain values and leaves functions to the worker or the live loop', () => {
        expect(collectWorkerValues({
            u_intensity: { type: 'float', value: 0.5 },
            u_color1: { type: 'vec3', value: vec3([1, 0, 0]) },
            u_mouse: { type: 'vec2', value: () => vec2([0, 0]) }
        })).toEqual({
            u_intensity: 0.5,
            u_color1: vec3([1, 0, 0])
        });
    });
});

describe('sampleLiveUniforms', () => {
    it('evaluates function values with the frame time and the render size', () => {
        const values = sampleLiveUniforms(
            ['u_mouse'],
            { u_mouse: { type: 'vec2', value: (time = 0, width = 0, height = 0) => vec2([time + width, height]) } },
            1000,
            640,
            480
        );

        expect(Array.from(values.u_mouse as Float32Array)).toEqual([1640, 480]);
    });

    it('passes plain values through', () => {
        expect(sampleLiveUniforms(
            ['u_intensity'],
            { u_intensity: { type: 'float', value: 0.5 } },
            0,
            1,
            1
        )).toEqual({ u_intensity: 0.5 });
    });
});

describe('transferCanvasToWorker', () => {
    it('throws on a second transfer of the same canvas instead of losing the canvas for good', () => {
        const offscreen = {} as unknown as OffscreenCanvas;
        const canvas = {
            transferControlToOffscreen: () => offscreen
        } as unknown as HTMLCanvasElement;

        expect(transferCanvasToWorker(canvas)).toBe(offscreen);
        expect(() => transferCanvasToWorker(canvas)).toThrow(/already transferred/);
    });
});
