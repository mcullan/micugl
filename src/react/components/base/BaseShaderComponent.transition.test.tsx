import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { Frameloop, MotionPolicy } from '@/types';

const PROGRAM_ID = 'transition-demo';
const WIDTH = 320;
const HEIGHT = 200;

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_swirl: 'float' }
});

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

interface SceneProps {
    value: number;
    frameloop?: Frameloop;
    reducedMotion?: MotionPolicy;
    saveData?: MotionPolicy;
}

const Scene = ({
    value,
    frameloop = 'always',
    reducedMotion = 'ignore',
    saveData = 'ignore'
}: SceneProps) => (
    <BaseShaderComponent
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        uniforms={{
            swirl: { type: 'float', value, transition: { duration: 100, easing: 'linear' } }
        }}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop={frameloop}
        reducedMotion={reducedMotion}
        saveData={saveData}
    />
);

interface SpringSceneProps {
    value: number;
    frameloop?: Frameloop;
}

const SpringScene = ({ value, frameloop = 'demand' }: SpringSceneProps) => (
    <BaseShaderComponent
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        uniforms={{
            swirl: {
                type: 'float',
                value,
                transition: { type: 'spring', stiffness: 1200, damping: 20 }
            }
        }}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop={frameloop}
        reducedMotion='ignore'
        saveData='ignore'
    />
);

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

describe('a real uniform transition, driven through a mounted BaseShaderComponent (no mocked runtime)', () => {
    it('a uniform prop change animates through advancing intermediate values before landing exactly on the target', async () => {
        await mount(<Scene value={0} />);
        frames.tick(0);
        expect(uploads('u_swirl')).toEqual([0]);

        await mount(<Scene value={10} />);
        frames.tick(25);
        frames.tick(50);
        frames.tick(75);
        frames.tick(100);
        frames.tick(125);

        const values = uploads('u_swirl') as number[];
        expect(values).not.toEqual([0, 10]);
        expect(values[values.length - 1]).toBe(10);
        expect(values.length).toBeGreaterThan(2);
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
    });

    it('frameloop="demand": a retarget keeps scheduling frames until settle, then the rAF queue drains', async () => {
        await mount(<Scene value={0} frameloop='demand' />);
        frames.tick(0);
        expect(uploads('u_swirl')).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await mount(<Scene value={10} frameloop='demand' />);
        expect(frames.pending()).toBe(1);

        frames.tick(25);
        expect(frames.pending()).toBe(1);

        frames.tick(50);
        frames.tick(75);
        frames.tick(100);
        frames.tick(125);

        expect(frames.pending()).toBe(0);
        const values = uploads('u_swirl') as number[];
        expect(values[values.length - 1]).toBe(10);
        expect(values.length).toBeGreaterThan(2);
    });

    it('a "static-frame" motion gate snaps to the target on its own, without anything else invalidating', async () => {
        mockReducedMotionActive();

        await mount(<Scene value={0} reducedMotion='static-frame' saveData='ignore' />);
        frames.tick(0);
        expect(uploads('u_swirl')).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await mount(<Scene value={10} reducedMotion='static-frame' saveData='ignore' />);

        expect(frames.pending()).toBe(1);

        frames.tick(1_000_000);

        expect(uploads('u_swirl')).toEqual([0, 10]);
        expect(frames.pending()).toBe(0);

        frames.tick(2_000_000);
        expect(uploads('u_swirl')).toEqual([0, 10]);
    });

    it('a spring prop change under frameloop="demand" self-sustains the rAF chain, overshoots and returns, lands exactly on the target, then drains', async () => {
        await mount(<SpringScene value={0} />);
        frames.tick(0);
        expect(uploads('u_swirl')).toEqual([0]);
        expect(frames.pending()).toBe(0);

        await mount(<SpringScene value={10} />);
        expect(frames.pending()).toBe(1);

        const sampleTimes = [
            1000, 1025, 1050, 1075, 1100, 1150, 1200, 1300, 1400, 1500, 1700, 1900, 1950, 2000, 2100
        ];
        for (const time of sampleTimes.slice(0, -1)) {
            frames.tick(time);
            expect(frames.pending()).toBe(1);
        }
        frames.tick(sampleTimes[sampleTimes.length - 1]);
        expect(frames.pending()).toBe(0);

        const values = uploads('u_swirl') as number[];
        expect(values[0]).toBe(0);

        const peakIndex = values.indexOf(Math.max(...values));
        expect(values[peakIndex]).toBeGreaterThan(10);

        const troughAfterPeak = Math.min(...values.slice(peakIndex + 1));
        expect(troughAfterPeak).toBeLessThan(10);

        expect(values[values.length - 1]).toBe(10);

        const uploadCountAtSettle = values.length;
        frames.tick(2200);
        expect(frames.pending()).toBe(0);
        expect(uploads('u_swirl').length).toBe(uploadCountAtSettle);
    });
});
