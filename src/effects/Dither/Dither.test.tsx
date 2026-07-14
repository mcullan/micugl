import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Dither } from '@/effects/Dither/Dither';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import { uploadsOf } from '@/testing/fixtures';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { Vec3 } from '@/types';

const WIDTH = 320;
const HEIGHT = 200;
const FIXTURE_A: Vec3 = [0.09, 0.61, 0.37];
const FIXTURE_B: Vec3 = [0.88, 0.24, 0.66];

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub();
    originalGetContext = (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => WebGLRenderingContext }).getContext =
        function stubGetContext() { return stub.gl };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = originalGetContext;
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

describe('Dither: the gradient component uploads its uniforms and drives u_time forward (T6)', () => {
    it('uploads the duotone colors and levels, and advances u_time across ticks in seconds', async () => {
        await mount(
            <Dither
                colorA={FIXTURE_A}
                colorB={FIXTURE_B}
                levels={4}
                scale={3}
                width={WIDTH}
                height={HEIGHT}
                useDevicePixelRatio={false}
                reducedMotion='ignore'
                saveData='ignore'
            />
        );

        for (let time = 0; time <= 160; time += 16) {
            act(() => { frames.tick(time) });
        }

        const colorA = uploadsOf(stub, 'u_colorA').map(value => Array.from(value as Float32Array));
        expect(colorA.length).toBeGreaterThan(0);
        expect(colorA[0]).toEqual(Array.from(new Float32Array([0.09, 0.61, 0.37])));

        const colorB = uploadsOf(stub, 'u_colorB').map(value => Array.from(value as Float32Array));
        expect(colorB[0]).toEqual(Array.from(new Float32Array([0.88, 0.24, 0.66])));

        const levels = uploadsOf(stub, 'u_levels') as number[];
        expect(levels).toContain(4);

        const times = uploadsOf(stub, 'u_time') as number[];
        expect(times.length).toBeGreaterThan(5);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThan(times[i - 1]);
        }
        expect(times[times.length - 1]).toBeLessThan(1);
    });
});
