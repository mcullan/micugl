import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ShaderRenderCallback } from '@/core';
import { vec2 } from '@/core';
import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import { ShaderEngine } from '@/react/components/engine/ShaderEngine';
import { useUniformUpdaters } from '@/react/hooks/useUniformUpdaters';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { Frameloop, MotionPolicy, UniformParam } from '@/types';

const PROGRAM_ID = 'gate-demo';
const WIDTH = 320;
const HEIGHT = 200;

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub();
    originalGetContext = (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => WebGLRenderingContext }).getContext =
        function stubGetContext() { return stub.gl };

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext;
    if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
    }
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

function uploads(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function latestVec(name: string): number[] {
    const calls = uploads(name);
    if (calls.length === 0) {
        throw new Error(`${name} has never been uploaded`);
    }
    return Array.from(calls[calls.length - 1] as Float32Array);
}

function mockReducedMotionActive(): void {
    window.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
}

const CAM_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_cam: 'float' }
});

interface CamSceneProps {
    counter: { value: number };
    invalidation: ReturnType<typeof createFrameInvalidation>;
    reducedMotion?: MotionPolicy;
    frameloop?: Frameloop;
}

const CamScene = ({ counter, invalidation, reducedMotion, frameloop = 'demand' }: CamSceneProps) => {
    const uniforms: Record<string, UniformParam> = {
        u_cam: { type: 'float', value: () => counter.value, invalidation }
    };
    return (
        <BaseShaderComponent
            programId={PROGRAM_ID}
            shaderConfig={CAM_CONFIG}
            uniforms={uniforms}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop={frameloop}
            reducedMotion={reducedMotion}
            saveData='ignore'
        />
    );
};

describe('a motion gate and a per-frame continuous producer (P2 inverted)', () => {
    it('suppresses a gated continuous producer while the ungated control advances', async () => {
        mockReducedMotionActive();
        const counter = { value: 0 };
        const invalidation = createFrameInvalidation();

        await mount(<CamScene counter={counter} invalidation={invalidation} />);
        act(() => { frames.tick(0) });

        const afterPoster = uploads('u_cam').length;
        expect(afterPoster).toBeGreaterThan(0);

        for (let i = 1; i <= 10; i++) {
            counter.value = i;
            act(() => { invalidation.request('continuous') });
            expect(frames.pending()).toBe(0);
            act(() => { frames.tick(16 * i) });
        }

        expect(uploads('u_cam').length).toBe(afterPoster);
    });

    it('the same continuous producer advances when the component opts out with reducedMotion="ignore"', async () => {
        mockReducedMotionActive();
        const counter = { value: 0 };
        const invalidation = createFrameInvalidation();

        await mount(<CamScene counter={counter} invalidation={invalidation} reducedMotion='ignore' />);
        act(() => { frames.tick(0) });

        const seen: number[] = [];
        for (let i = 1; i <= 10; i++) {
            counter.value = i;
            act(() => { invalidation.request('continuous') });
            expect(frames.pending()).toBe(1);
            act(() => { frames.tick(16 * i) });
            seen.push(uploads('u_cam')[uploads('u_cam').length - 1] as number);
        }

        expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
});

const COLOR_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_color: 'float' }
});

interface ColorSceneProps {
    value: number;
    reducedMotion?: MotionPolicy;
    frameloop?: Frameloop;
}

const ColorScene = ({ value, reducedMotion, frameloop }: ColorSceneProps) => (
    <BaseShaderComponent
        programId={PROGRAM_ID}
        shaderConfig={COLOR_CONFIG}
        uniforms={{ u_color: { type: 'float', value } }}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop={frameloop}
        reducedMotion={reducedMotion}
        saveData='ignore'
    />
);

const renderQuad: ShaderRenderCallback = (_time, _resources, gl) => {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

const OverrideScene = ({ portRef }: { portRef: { current: UniformDebugPort | null } }) => {
    const { updaters, port, invalidation, capturesAreNonReproducible } = useUniformUpdaters(
        PROGRAM_ID,
        { u_color: { type: 'float', value: 1 } },
        { saveData: 'ignore' }
    );
    portRef.current = port;

    return (
        <ShaderEngine
            programConfigs={{ [PROGRAM_ID]: COLOR_CONFIG }}
            renderCallback={renderQuad}
            uniformUpdaters={updaters}
            invalidation={invalidation}
            capturesAreNonReproducible={capturesAreNonReproducible}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            saveData='ignore'
            useFastPath
        />
    );
};

describe('a plain uniform change under a motion gate (P3 inverted)', () => {
    it('repaints the poster exactly once with the new value under a static gate', async () => {
        mockReducedMotionActive();

        await mount(<ColorScene value={1} />);
        act(() => { frames.tick(0) });
        expect(uploads('u_color')).toEqual([1]);

        await mount(<ColorScene value={2} />);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(uploads('u_color')).toEqual([1, 2]);
        expect(frames.pending()).toBe(0);
    });

    it('repaints the poster under a pause gate too', async () => {
        mockReducedMotionActive();

        await mount(<ColorScene value={1} reducedMotion='pause' />);
        act(() => { frames.tick(0) });
        expect(uploads('u_color')).toEqual([1]);

        await mount(<ColorScene value={2} reducedMotion='pause' />);
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(uploads('u_color')).toEqual([1, 2]);
    });

    it('does NOT repaint a plain change under frameloop="demand" with no gate', async () => {
        await mount(<ColorScene value={1} reducedMotion='ignore' frameloop='demand' />);
        act(() => { frames.tick(0) });
        expect(uploads('u_color')).toEqual([1]);
        expect(frames.pending()).toBe(0);

        await mount(<ColorScene value={2} reducedMotion='ignore' frameloop='demand' />);
        expect(frames.pending()).toBe(0);
        act(() => { frames.tick(16) });

        expect(uploads('u_color')).toEqual([1]);
        expect(frames.pending()).toBe(0);
    });
});

const VEC_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_vec: 'vec2' }
});

const VecScene = ({ value }: { value: [number, number] }) => (
    <BaseShaderComponent
        programId={PROGRAM_ID}
        shaderConfig={VEC_CONFIG}
        uniforms={{ u_vec: { type: 'vec2', value: vec2(value) } }}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        saveData='ignore'
    />
);

describe('a gated mount with a vec uniform (P0)', () => {
    it('does not crash at mount and paints the real vec values on the first frame', async () => {
        mockReducedMotionActive();

        await mount(<VecScene value={[0.25, 0.5]} />);
        act(() => { frames.tick(0) });

        expect(latestVec('u_vec')).toEqual([0.25, 0.5]);
    });
});

describe('a devtools override under a motion gate', () => {
    it('repaints the poster with the override value', async () => {
        mockReducedMotionActive();
        const portRef: { current: UniformDebugPort | null } = { current: null };

        await mount(<OverrideScene portRef={portRef} />);
        act(() => { frames.tick(0) });
        expect(uploads('u_color')).toEqual([1]);

        const port = portRef.current;
        if (!port) {
            throw new Error('debug port was never mounted');
        }
        act(() => { port.setOverride('u_color', 7) });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });

        expect(uploads('u_color')).toEqual([1, 7]);
    });
});
