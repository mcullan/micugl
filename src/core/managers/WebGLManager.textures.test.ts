import { describe, expect, it } from 'vitest';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { GL_TEXTURE0 } from '@/core/lib/glConstants';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { RenderLoop } from '@/react/lib/renderLoop';
import { createCanvasStub } from '@/testing';
import type { ShaderProgramConfig, TextureSource, TextureUploadSource, UniformType } from '@/types';

const CONFIG: ShaderProgramConfig = {
    vertexShader: '',
    fragmentShader: '',
    uniforms: [
        { name: 'u_image', type: 'sampler2D' },
        { name: 'u_a', type: 'sampler2D' },
        { name: 'u_b', type: 'sampler2D' },
        { name: 'u_cam', type: 'sampler2D' }
    ]
};

const ALL_SAMPLERS: Record<string, UniformType> = {
    u_image: 'sampler2D',
    u_a: 'sampler2D',
    u_b: 'sampler2D',
    u_cam: 'sampler2D'
};

interface FakeSourceHandle {
    source: TextureSource;
    invalidation: FrameInvalidation;
    produceFrame: (width?: number, height?: number) => void;
    setReady: (ready: boolean) => void;
}

function createFakeSource(
    id: string,
    initial: { width: number; height: number } | null = null
): FakeSourceHandle {
    const invalidation = createFrameInvalidation();
    let frame: TextureUploadSource | null = initial === null
        ? null
        : ({ videoWidth: initial.width, videoHeight: initial.height } as unknown as TextureUploadSource);
    let ready = initial !== null;
    let version = 0;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(),
        getFrame: () => (ready ? frame : null),
        invalidation
    };

    return {
        source,
        invalidation,
        produceFrame: (width = 640, height = 480) => {
            frame = { videoWidth: width, videoHeight: height } as unknown as TextureUploadSource;
            ready = true;
            version += 1;
            invalidation.request();
        },
        setReady: (next: boolean) => { ready = next }
    };
}

const samplerLocation = (manager: WebGLManager, programId: string, name: string): WebGLUniformLocation | null =>
    manager.resources.get(programId)?.uniforms[name] ?? null;

describe('WebGLManager.registerTextureBinding', () => {
    it('defines the source texture from the source options', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const { source } = createFakeSource('u_image', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_image', source });

        expect(manager.textures.has('u_image')).toBe(true);
    });

    it('uploads the texture unit to the sampler, so a unit past 0 is what the shader actually samples', () => {
        const { canvas, uniformCalls, reset } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        reset();
        manager.registerTextureBinding('p', {
            unit: 3,
            samplerName: 'u_cam',
            source: createFakeSource('u_cam', { width: 4, height: 4 }).source
        });

        expect(uniformCalls).toEqual([{
            name: 'uniform1i',
            location: samplerLocation(manager, 'p', 'u_cam'),
            value: 3
        }]);
        expect(samplerLocation(manager, 'p', 'u_cam')).not.toBeNull();
    });

    it('gives every binding its own sampler, each holding its own non-zero-capable unit', () => {
        const { canvas, uniformCalls, reset } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        reset();
        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_a',
            source: createFakeSource('a', { width: 4, height: 4 }).source
        });
        manager.registerTextureBinding('p', {
            unit: 2,
            samplerName: 'u_b',
            source: createFakeSource('b', { width: 8, height: 8 }).source
        });

        expect(uniformCalls).toEqual([
            { name: 'uniform1i', location: samplerLocation(manager, 'p', 'u_a'), value: 0 },
            { name: 'uniform1i', location: samplerLocation(manager, 'p', 'u_b'), value: 2 }
        ]);
    });

    it('makes the sampler current on its own program before uploading the unit', () => {
        const { canvas, calls, reset } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        const other = manager.createProgram('other', CONFIG);
        const target = manager.createProgram('p', CONFIG);

        manager.prepareRender('other');
        expect(other.program).not.toBe(target.program);

        reset();
        manager.registerTextureBinding('p', {
            unit: 1,
            samplerName: 'u_cam',
            source: createFakeSource('u_cam', { width: 4, height: 4 }).source
        });

        const useIndex = calls.findIndex(call => call.name === 'useProgram' && call.args[0] === target.program);
        const uniformIndex = calls.findIndex(call => call.name === 'uniform1i');

        expect(useIndex).toBeGreaterThanOrEqual(0);
        expect(uniformIndex).toBeGreaterThan(useIndex);
    });

    it('throws when the sampler was never declared on the program, instead of uploading nowhere', () => {
        const { canvas, calls } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        expect(() => {
            manager.registerTextureBinding('p', {
                unit: 1,
                samplerName: 'u_undeclared',
                source: createFakeSource('u_cam', { width: 4, height: 4 }).source
            });
        }).toThrow(/was never declared for it/);

        expect(calls.some(call => call.name === 'uniform1i')).toBe(false);
    });

    it('throws when the shader declares the sampler name as something no uniform1i can reach', () => {
        const { canvas } = createCanvasStub({
            activeUniforms: { ...ALL_SAMPLERS, u_image: 'float' }
        });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', {
            ...CONFIG,
            uniforms: [{ name: 'u_image', type: 'float' }]
        });

        expect(() => {
            manager.registerTextureBinding('p', {
                unit: 0,
                samplerName: 'u_image',
                source: createFakeSource('u_image', { width: 4, height: 4 }).source
            });
        }).toThrow(/is a float in the shader source/);
    });

    it('throws when the sampler name is declared but the shader never samples it, so no texture binds nowhere', () => {
        const { canvas, uniformCalls, reset } = createCanvasStub({ activeUniforms: { u_a: 'sampler2D' } });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        reset();
        let thrown: Error | null = null;
        try {
            manager.registerTextureBinding('p', {
                unit: 1,
                samplerName: 'u_cam',
                source: createFakeSource('u_cam', { width: 4, height: 4 }).source
            });
        } catch (error) {
            thrown = error as Error;
        }

        expect(thrown).not.toBeNull();
        expect(thrown?.message).toContain('u_cam');
        expect(thrown?.message).toContain('Sample it in the shader');
        expect(thrown?.message).toContain('fix the sampler name');
        expect(thrown?.message).toContain('remove its entry from the "textures" prop');
        expect(samplerLocation(manager, 'p', 'u_cam')).toBeNull();
        expect(uniformCalls).toHaveLength(0);
    });

    it('throws for an unknown program', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        const { source } = createFakeSource('u_image', { width: 4, height: 4 });

        expect(() => { manager.registerTextureBinding('nope', { unit: 0, samplerName: 'u_image', source }) })
            .toThrow(/Program with id nope not found/);
    });

    it('throws when a unit is past MAX_TEXTURE_IMAGE_UNITS instead of binding a unit nothing can sample', () => {
        const { canvas } = createCanvasStub({ maxTextureImageUnits: 8 });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const { source } = createFakeSource('u_image', { width: 4, height: 4 });

        expect(() => { manager.registerTextureBinding('p', { unit: 8, samplerName: 'u_image', source }) })
            .toThrow(/MAX_TEXTURE_IMAGE_UNITS/);
        expect(() => { manager.registerTextureBinding('p', { unit: 7, samplerName: 'u_image', source }) })
            .not.toThrow();
    });

    it('throws when two sources are registered on the same unit', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_a',
            source: createFakeSource('a', { width: 4, height: 4 }).source
        });

        expect(() => {
            manager.registerTextureBinding('p', {
                unit: 0,
                samplerName: 'u_b',
                source: createFakeSource('b', { width: 4, height: 4 }).source
            });
        }).toThrow(/already bound to source "a"/);
    });

    it('throws when the same source id is registered twice on one program', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const { source } = createFakeSource('a', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_a', source });

        expect(() => {
            manager.registerTextureBinding('p', { unit: 1, samplerName: 'u_b', source });
        }).toThrow(/already bound on program/);
    });

    it('throws when two sources are pointed at one sampler, which could only hold one of their units', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_image',
            source: createFakeSource('a', { width: 4, height: 4 }).source
        });

        expect(() => {
            manager.registerTextureBinding('p', {
                unit: 1,
                samplerName: 'u_image',
                source: createFakeSource('b', { width: 4, height: 4 }).source
            });
        }).toThrow(/already samples source "a"/);
    });

    it('throws when a second source object claims an id another program already bound', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);
        manager.createProgram('q', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_cam',
            source: createFakeSource('u_cam', { width: 4, height: 4 }).source
        });

        expect(() => {
            manager.registerTextureBinding('q', {
                unit: 0,
                samplerName: 'u_cam',
                source: createFakeSource('u_cam', { width: 4, height: 4 }).source
            });
        }).toThrow(/already owned by a different TextureSource/);
    });
});

describe('WebGLManager.updateTextures', () => {
    it('binds each source to its own unit and leaves the sampler holding that unit', () => {
        const { canvas, calls, uniformCalls, reset } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_a',
            source: createFakeSource('a', { width: 4, height: 4 }).source
        });
        manager.registerTextureBinding('p', {
            unit: 2,
            samplerName: 'u_b',
            source: createFakeSource('b', { width: 8, height: 8 }).source
        });

        expect(uniformCalls).toEqual([
            { name: 'uniform1i', location: samplerLocation(manager, 'p', 'u_a'), value: 0 },
            { name: 'uniform1i', location: samplerLocation(manager, 'p', 'u_b'), value: 2 }
        ]);

        reset();
        manager.updateTextures('p');

        const units = calls
            .filter(call => call.name === 'activeTexture')
            .map(call => call.args[0]);

        expect(units).toEqual([GL_TEXTURE0 + 0, GL_TEXTURE0 + 2, GL_TEXTURE0]);
    });

    it('leaves unit 0 active so a later bindTexture cannot land on a source texture unit', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 3,
            samplerName: 'u_cam',
            source: createFakeSource('u_cam', { width: 4, height: 4 }).source
        });

        reset();
        manager.updateTextures('p');

        const units = calls
            .filter(call => call.name === 'activeTexture')
            .map(call => call.args[0]);

        expect(units[units.length - 1]).toBe(GL_TEXTURE0);
    });

    it('activates the unit before uploading, so an upload cannot clobber another unit', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_a',
            source: createFakeSource('a', { width: 4, height: 4 }).source
        });
        manager.registerTextureBinding('p', {
            unit: 1,
            samplerName: 'u_b',
            source: createFakeSource('b', { width: 8, height: 8 }).source
        });

        reset();
        manager.updateTextures('p');

        const sequence = calls
            .filter(call => call.name === 'activeTexture' || call.name === 'texImage2D')
            .map(call => call.name);

        expect(sequence).toEqual(['activeTexture', 'texImage2D', 'activeTexture', 'texImage2D', 'activeTexture']);
    });

    it('uploads once and then re-binds without re-uploading while the version is unchanged', () => {
        const { canvas, calls, texImage2DCalls, texSubImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        cam.produceFrame(640, 480);
        reset();

        manager.updateTextures('p');
        expect(texImage2DCalls).toHaveLength(1);

        reset();
        manager.updateTextures('p');
        manager.updateTextures('p');

        expect(texImage2DCalls).toHaveLength(0);
        expect(texSubImage2DCalls).toHaveLength(0);
        expect(calls.filter(call => call.name === 'bindTexture')).toHaveLength(2);
    });

    it('uploads exactly once per new frame version', () => {
        const { canvas, texSubImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        cam.produceFrame(640, 480);
        manager.updateTextures('p');
        reset();

        cam.produceFrame(640, 480);
        manager.updateTextures('p');
        manager.updateTextures('p');
        cam.produceFrame(640, 480);
        manager.updateTextures('p');

        expect(texSubImage2DCalls).toHaveLength(2);
    });

    it('binds the placeholder without uploading while the source is not ready', () => {
        const { canvas, calls, texImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const image = createFakeSource('u_image');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_image', source: image.source });

        reset();
        manager.updateTextures('p');

        expect(texImage2DCalls).toHaveLength(0);
        expect(calls.filter(call => call.name === 'bindTexture')).toHaveLength(1);
    });

    it('still uploads once the source becomes ready, even though its version never changed', () => {
        const { canvas, texImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const image = createFakeSource('u_image', { width: 4, height: 4 });
        image.setReady(false);
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_image', source: image.source });

        reset();
        manager.updateTextures('p');
        expect(texImage2DCalls).toHaveLength(0);

        image.setReady(true);
        manager.updateTextures('p');

        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 4, height: 4 });
    });

    it('reallocates when a live source changes dimensions mid-stream', () => {
        const { canvas, texImage2DCalls, texSubImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        cam.produceFrame(640, 480);
        manager.updateTextures('p');
        cam.produceFrame(640, 480);
        manager.updateTextures('p');
        reset();

        cam.produceFrame(1280, 720);
        manager.updateTextures('p');

        expect(texSubImage2DCalls).toHaveLength(0);
        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 1280, height: 720 });

        reset();
        cam.produceFrame(1280, 720);
        manager.updateTextures('p');

        expect(texImage2DCalls).toHaveLength(0);
        expect(texSubImage2DCalls).toHaveLength(1);
    });

    it('does nothing for a program with no texture bindings', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        reset();
        manager.updateTextures('p');

        expect(calls).toHaveLength(0);
    });
});

describe('WebGLManager.prepareRender with textures', () => {
    it('throws for a program with source-texture bindings, which it would render as the placeholder', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        manager.registerTextureBinding('p', {
            unit: 0,
            samplerName: 'u_cam',
            source: createFakeSource('u_cam', { width: 4, height: 4 }).source
        });

        expect(() => { manager.prepareRender('p') }).toThrow(/has source-texture bindings/);
    });

    it('still renders a program with no texture bindings', () => {
        const { canvas } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        expect(() => { manager.prepareRender('p') }).not.toThrow();
    });
});

describe('WebGLManager.fastRender with textures', () => {
    it('binds and uploads bound textures as part of the fast path', () => {
        const { canvas, texImage2DCalls, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });
        cam.produceFrame(640, 480);

        reset();
        manager.fastRender('p', 0, false);

        expect(texImage2DCalls).toHaveLength(1);
        expect(calls.some(call => call.name === 'activeTexture')).toBe(true);
    });
});

describe('WebGLManager texture cleanup', () => {
    it('deletes source textures and drops bindings on destroyAll', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        reset();
        manager.destroyAll();

        expect(calls.filter(call => call.name === 'deleteTexture')).toHaveLength(1);
        expect(manager.textures.has('u_cam')).toBe(false);
    });

    it('deletes the source textures a destroyed program was the last to bind', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        reset();
        manager.destroy('p');

        expect(calls.filter(call => call.name === 'deleteTexture')).toHaveLength(1);
        expect(manager.textures.has('u_cam')).toBe(false);
        expect(manager.textures.getTextureIds()).toEqual([]);
    });

    it('keeps a source texture another program still binds', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);
        manager.createProgram('q', CONFIG);

        const cam = createFakeSource('u_cam', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });
        manager.registerTextureBinding('q', { unit: 0, samplerName: 'u_cam', source: cam.source });

        reset();
        manager.destroy('p');

        expect(calls.filter(call => call.name === 'deleteTexture')).toHaveLength(0);
        expect(manager.textures.has('u_cam')).toBe(true);
    });

    it('drops a program\'s bindings on destroy so a stale binding cannot be re-bound', () => {
        const { canvas, calls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam', { width: 4, height: 4 });
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        manager.destroy('p');
        reset();
        manager.updateTextures('p');

        expect(calls).toHaveLength(0);
    });

    it('re-uploads a source that outlived the program it was bound to, instead of sampling a fresh placeholder', () => {
        const { canvas, texImage2DCalls, uniformCalls, reset } = createCanvasStub({ activeUniforms: ALL_SAMPLERS });
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 2, samplerName: 'u_cam', source: cam.source });
        cam.produceFrame(1280, 720);
        manager.updateTextures('p');

        expect(texImage2DCalls).toHaveLength(2);

        manager.destroy('p');
        manager.createProgram('p', CONFIG);

        reset();
        manager.registerTextureBinding('p', { unit: 2, samplerName: 'u_cam', source: cam.source });
        manager.updateTextures('p');
        manager.updateTextures('p');

        expect(uniformCalls).toEqual([{
            name: 'uniform1i',
            location: samplerLocation(manager, 'p', 'u_cam'),
            value: 2
        }]);
        expect(texImage2DCalls.filter(call => call.width === 1280)).toHaveLength(1);
        expect(manager.textures.getDimensions('u_cam')).toEqual({ width: 1280, height: 720 });
    });
});

describe('a dynamic source under frameloop demand', () => {
    interface Harness {
        loop: RenderLoop;
        cam: FakeSourceHandle;
        renders: number[];
        flush: () => void;
    }

    function createDemandHarness(manager: WebGLManager): Harness {
        const cam = createFakeSource('u_cam');
        manager.registerTextureBinding('p', { unit: 0, samplerName: 'u_cam', source: cam.source });

        const renders: number[] = [];
        let pending: ((now: number) => void) | null = null;
        let now = 0;

        const loop = new RenderLoop({
            requestAnimationFrame: callback => {
                pending = callback;
                return 1;
            },
            cancelAnimationFrame: () => { pending = null },
            now: () => now,
            render: elapsed => {
                renders.push(elapsed);
                manager.fastRender('p', elapsed, false);
            },
            frameloop: 'demand'
        });

        cam.source.invalidation.connect(() => { loop.invalidate() });

        return {
            loop,
            cam,
            renders,
            flush: () => {
                for (let i = 0; i < 8 && pending !== null; i++) {
                    const callback = pending;
                    pending = null;
                    now += 16;
                    callback(now);
                }
            }
        };
    }

    it('renders and uploads only when the source asks for a frame, never on its own', () => {
        const { canvas, texImage2DCalls, texSubImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const harness = createDemandHarness(manager);
        harness.loop.start();
        harness.flush();

        reset();
        harness.renders.length = 0;

        harness.flush();
        expect(harness.renders).toHaveLength(0);
        expect(texImage2DCalls).toHaveLength(0);
        expect(texSubImage2DCalls).toHaveLength(0);

        harness.cam.produceFrame(640, 480);
        harness.flush();

        expect(harness.renders).toHaveLength(1);
        expect(texImage2DCalls).toHaveLength(1);

        reset();
        harness.renders.length = 0;

        harness.cam.produceFrame(640, 480);
        harness.flush();
        harness.cam.produceFrame(640, 480);
        harness.flush();

        expect(harness.renders).toHaveLength(2);
        expect(texSubImage2DCalls).toHaveLength(2);
        expect(texImage2DCalls).toHaveLength(0);
    });

    it('reallocates mid-stream under demand when the live source changes resolution', () => {
        const { canvas, texImage2DCalls, texSubImage2DCalls, reset } = createCanvasStub();
        const manager = new WebGLManager(canvas);
        manager.createProgram('p', CONFIG);

        const harness = createDemandHarness(manager);
        harness.loop.start();
        harness.flush();

        harness.cam.produceFrame(640, 480);
        harness.flush();
        harness.cam.produceFrame(640, 480);
        harness.flush();

        reset();
        harness.cam.produceFrame(320, 240);
        harness.flush();

        expect(texSubImage2DCalls).toHaveLength(0);
        expect(texImage2DCalls).toHaveLength(1);
        expect(texImage2DCalls[0]).toMatchObject({ width: 320, height: 240 });
    });
});
