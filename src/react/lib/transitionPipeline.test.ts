import { describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { GL_FLOAT, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { vec3 } from '@/core/lib/vectorUtils';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import {
    buildLiveUpdaters,
    collectLiveValues,
    createUniformDebugPort,
    type LiveValues,
    parseUniformStructureKey,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import {
    buildPasses,
    DEFAULT_FRAMEBUFFER_OPTIONS,
    DEFAULT_RENDER_OPTIONS
} from '@/react/lib/pingPongPasses';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createCanvasStub } from '@/testing';
import type { UniformParam } from '@/types';

const PROGRAM_ID = 'transition-demo';
const WIDTH = 320;
const HEIGHT = 200;

const GL_STUB_CONFIG: GLStubConfig = {
    extensions: { OES_texture_float: true, OES_texture_float_linear: true },
    renderableTypes: [GL_UNSIGNED_BYTE, GL_FLOAT]
};

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_swirl: 'float', u_color: 'vec3' }
});

function uploadsOf(stub: GLStubHandle, name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function swirlUploads(stub: GLStubHandle): unknown[] {
    return uploadsOf(stub, 'u_swirl');
}

describe('a real uniform transition, driven through the production pipeline (no mocks)', () => {
    it('advances strictly between from and to across intermediate frames, lands exactly on the target, then stops uploading', () => {
        const runtime = createTransitionRuntime(() => false);

        let uniforms: Record<string, UniformParam> = {
            swirl: { type: 'float', value: 0, transition: { duration: 100, easing: 'linear' } }
        };
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const valuesRef = { current: collectLiveValues(uniforms) };
        const updaters = buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime);

        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        updaters.forEach(u => { manager.registerUniformUpdater(PROGRAM_ID, u.name, u.type, u.updateFn) });
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);

        const commit = (nextUniforms: Record<string, UniformParam>): void => {
            uniforms = nextUniforms;
            valuesRef.current = collectLiveValues(uniforms);
            runtime.applyTargets(uniforms, 'none');
        };

        commit(uniforms);
        stub.reset();

        manager.updateUniforms(PROGRAM_ID, 0);
        expect(swirlUploads(stub)).toEqual([0]);

        commit({
            swirl: { type: 'float', value: 10, transition: { duration: 100, easing: 'linear' } }
        });

        manager.updateUniforms(PROGRAM_ID, 1000);
        manager.updateUniforms(PROGRAM_ID, 1025);
        manager.updateUniforms(PROGRAM_ID, 1050);
        manager.updateUniforms(PROGRAM_ID, 1075);
        manager.updateUniforms(PROGRAM_ID, 1100);

        expect(swirlUploads(stub)).toEqual([0, 2.5, 5, 7.5, 10]);

        manager.updateUniforms(PROGRAM_ID, 1200);
        manager.updateUniforms(PROGRAM_ID, 1300);

        expect(swirlUploads(stub)).toEqual([0, 2.5, 5, 7.5, 10]);
    });

    it('a spring transition overshoots the target and returns before landing exactly on it, then stops uploading', () => {
        const runtime = createTransitionRuntime(() => false);
        const springConfig = { type: 'spring' as const, stiffness: 1200, damping: 20 };

        let uniforms: Record<string, UniformParam> = {
            swirl: { type: 'float', value: 0, transition: springConfig }
        };
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const valuesRef = { current: collectLiveValues(uniforms) };
        const updaters = buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime);

        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        updaters.forEach(u => { manager.registerUniformUpdater(PROGRAM_ID, u.name, u.type, u.updateFn) });
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);

        const commit = (nextUniforms: Record<string, UniformParam>): void => {
            uniforms = nextUniforms;
            valuesRef.current = collectLiveValues(uniforms);
            runtime.applyTargets(uniforms, 'none');
        };

        commit(uniforms);
        stub.reset();

        manager.updateUniforms(PROGRAM_ID, 0);
        expect(swirlUploads(stub)).toEqual([0]);

        commit({ swirl: { type: 'float', value: 10, transition: springConfig } });

        const sampleTimes = [
            1000, 1025, 1050, 1075, 1100, 1150, 1200, 1300, 1400, 1500, 1700, 1900, 1950, 2000, 2100
        ];
        for (const time of sampleTimes) {
            manager.updateUniforms(PROGRAM_ID, time);
        }

        const values = swirlUploads(stub) as number[];
        expect(values[0]).toBe(0);

        const peakIndex = values.indexOf(Math.max(...values));
        expect(values[peakIndex]).toBeGreaterThan(10);
        expect(values[peakIndex]).toBeCloseTo(13.413144, 3);

        const troughAfterPeak = Math.min(...values.slice(peakIndex + 1));
        expect(troughAfterPeak).toBeLessThan(10);

        expect(values[values.length - 1]).toBe(10);

        const uploadCountAtSettle = values.length;
        manager.updateUniforms(PROGRAM_ID, 2200);
        manager.updateUniforms(PROGRAM_ID, 2300);
        expect(swirlUploads(stub).length).toBe(uploadCountAtSettle);
    });

    it('a spring retarget mid-flight preserves velocity, so a mid-flight color chase never resets speed to zero', () => {
        const runtime = createTransitionRuntime(() => false);
        const springConfig = { type: 'spring' as const, stiffness: 170, damping: 10 };

        let uniforms: Record<string, UniformParam> = {
            swirl: { type: 'float', value: 0, transition: springConfig }
        };
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const valuesRef = { current: collectLiveValues(uniforms) };
        const updaters = buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime);

        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        updaters.forEach(u => { manager.registerUniformUpdater(PROGRAM_ID, u.name, u.type, u.updateFn) });
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);

        const commit = (nextUniforms: Record<string, UniformParam>): void => {
            uniforms = nextUniforms;
            valuesRef.current = collectLiveValues(uniforms);
            runtime.applyTargets(uniforms, 'none');
        };

        commit(uniforms);
        stub.reset();
        manager.updateUniforms(PROGRAM_ID, 0);

        const latest = (): number => {
            const values = swirlUploads(stub) as number[];
            return values[values.length - 1];
        };

        commit({ swirl: { type: 'float', value: 10, transition: springConfig } });
        manager.updateUniforms(PROGRAM_ID, 1000);
        manager.updateUniforms(PROGRAM_ID, 1050);
        const valueAt1050 = latest();
        manager.updateUniforms(PROGRAM_ID, 1100);
        const valueAt1100 = latest();

        const speedBeforeRetarget = (valueAt1100 - valueAt1050) / 50;
        expect(speedBeforeRetarget).toBeGreaterThan(0);

        commit({ swirl: { type: 'float', value: 20, transition: springConfig } });
        manager.updateUniforms(PROGRAM_ID, 1100);
        expect(latest()).toBe(valueAt1100);

        manager.updateUniforms(PROGRAM_ID, 1116);
        const speedAfterRetarget = (latest() - valueAt1100) / 16;

        expect(speedAfterRetarget).toBeGreaterThan(speedBeforeRetarget);
    });

    it('a vec3 transition uploads advancing buffers every frame and lands exactly on the target', () => {
        const runtime = createTransitionRuntime(() => false);

        let uniforms: Record<string, UniformParam> = {
            color: { type: 'vec3', value: vec3([0, 0, 0]), transition: { duration: 100, easing: 'linear' } }
        };
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const valuesRef = { current: collectLiveValues(uniforms) };
        const updaters = buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime);

        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        updaters.forEach(u => { manager.registerUniformUpdater(PROGRAM_ID, u.name, u.type, u.updateFn) });
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);

        runtime.applyTargets(uniforms, 'none');
        stub.reset();

        manager.updateUniforms(PROGRAM_ID, 0);

        uniforms = {
            color: { type: 'vec3', value: vec3([1, 2, 4]), transition: { duration: 100, easing: 'linear' } }
        };
        valuesRef.current = collectLiveValues(uniforms);
        runtime.applyTargets(uniforms, 'none');

        const uploadCount = (): number => uploadsOf(stub, 'u_color').length;
        const latestUpload = (): number[] => {
            const calls = uploadsOf(stub, 'u_color');
            return Array.from(calls[calls.length - 1] as Float32Array);
        };

        const observed: { count: number; value: number[] }[] = [];
        for (const time of [1000, 1025, 1050, 1075, 1100]) {
            manager.updateUniforms(PROGRAM_ID, time);
            observed.push({ count: uploadCount(), value: latestUpload() });
        }

        expect(observed.map(entry => entry.count)).toEqual([1, 2, 3, 4, 5]);
        expect(observed.map(entry => entry.value)).toEqual([
            [0, 0, 0],
            [0.25, 0.5, 1],
            [0.5, 1, 2],
            [0.75, 1.5, 3],
            [1, 2, 4]
        ]);

        manager.updateUniforms(PROGRAM_ID, 1200);
        expect(uploadCount()).toBe(5);
    });

    it('a devtools override wins immediately over an in-flight transition', () => {
        const overridesRef: { current: LiveValues } = { current: {} };
        const overrideAwareRuntime = createTransitionRuntime(
            name => Object.prototype.hasOwnProperty.call(overridesRef.current, name)
        );

        let uniforms: Record<string, UniformParam> = {
            swirl: { type: 'float', value: 0, transition: { duration: 100, easing: 'linear' } }
        };
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const baseValuesRef = { current: collectLiveValues(uniforms) };
        const valuesRef = { current: collectLiveValues(uniforms) };
        const descriptorsRef = { current: descriptors };
        const repaints: number[] = [];
        const port = createUniformDebugPort({
            descriptorsRef,
            baseValuesRef,
            overridesRef,
            valuesRef,
            onChange: () => { overrideAwareRuntime.invalidation.request() }
        });
        overrideAwareRuntime.invalidation.connect(() => { repaints.push(1) });
        const updaters = buildLiveUpdaters(
            parsed.descriptors,
            parsed.skipDefaults,
            valuesRef,
            overrideAwareRuntime
        );

        const stub = createCanvasStub();
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        updaters.forEach(u => { manager.registerUniformUpdater(PROGRAM_ID, u.name, u.type, u.updateFn) });
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);

        overrideAwareRuntime.applyTargets(uniforms, 'none');
        stub.reset();

        manager.updateUniforms(PROGRAM_ID, 0);

        uniforms = { swirl: { type: 'float', value: 10, transition: { duration: 100, easing: 'linear' } } };
        baseValuesRef.current = collectLiveValues(uniforms);
        valuesRef.current = baseValuesRef.current;
        overrideAwareRuntime.applyTargets(uniforms, 'none');

        manager.updateUniforms(PROGRAM_ID, 1000);
        manager.updateUniforms(PROGRAM_ID, 1025);
        expect(swirlUploads(stub)).toEqual([0, 2.5]);

        const repaintsBeforeOverride = repaints.length;
        port.setOverride('u_swirl', 999);
        expect(repaints.length).toBe(repaintsBeforeOverride + 1);

        manager.updateUniforms(PROGRAM_ID, 1050);
        expect(swirlUploads(stub)).toEqual([0, 2.5, 999]);

        manager.updateUniforms(PROGRAM_ID, 1075);
        expect(swirlUploads(stub)).toEqual([0, 2.5, 999]);

        port.clearOverride('u_swirl');
        expect(repaints.length).toBe(repaintsBeforeOverride + 2);

        manager.updateUniforms(PROGRAM_ID, 1100);
        expect(swirlUploads(stub)).toEqual([0, 2.5, 999, 10]);
    });

    it('ping-pong program uniforms transition for free, through the same passUniformsFrom path as any other pass uniform', () => {
        const runtime = createTransitionRuntime(() => false);

        let uniforms: Record<string, UniformParam> = {
            swirl: { type: 'float', value: 0, transition: { duration: 100, easing: 'linear' } }
        };

        const valuesRef = { current: collectLiveValues(uniforms) };

        const commit = (nextUniforms: Record<string, UniformParam>): void => {
            uniforms = nextUniforms;
            valuesRef.current = collectLiveValues(uniforms);
            runtime.applyTargets(uniforms, 'none');
        };

        commit(uniforms);
        const descriptors = uniformDescriptors(uniforms);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));
        const primaryUpdaters = {
            [PROGRAM_ID]: buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime)
        };
        const { passes, framebuffers } = buildPasses(
            PROGRAM_ID,
            undefined,
            0,
            primaryUpdaters,
            {},
            DEFAULT_FRAMEBUFFER_OPTIONS,
            DEFAULT_RENDER_OPTIONS,
            undefined
        );

        const stub = createCanvasStub(GL_STUB_CONFIG);
        const manager = new WebGLManager(stub.canvas);
        manager.createProgram(PROGRAM_ID, CONFIG);
        for (const [id, options] of Object.entries(framebuffers)) {
            manager.fbo.createFramebuffer(id, options);
        }

        const passSystem = new Passes(manager);
        for (const pass of passes) {
            passSystem.addPass(pass);
        }
        passSystem.initializeResources();
        manager.setSize(WIDTH, HEIGHT, WIDTH, HEIGHT);
        for (const [id, options] of Object.entries(framebuffers)) {
            manager.fbo.resizeFramebuffer(id, options.width || WIDTH, options.height || HEIGHT);
        }

        stub.reset();
        passSystem.execute(0);
        expect(new Set(swirlUploads(stub))).toEqual(new Set([0]));

        commit({ swirl: { type: 'float', value: 10, transition: { duration: 100, easing: 'linear' } } });

        stub.reset();
        passSystem.execute(1000);
        expect(new Set(swirlUploads(stub))).toEqual(new Set([0]));

        stub.reset();
        passSystem.execute(1050);
        expect(new Set(swirlUploads(stub))).toEqual(new Set([5]));

        stub.reset();
        passSystem.execute(1100);
        expect(new Set(swirlUploads(stub))).toEqual(new Set([10]));
    });
});
