import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Grain } from '@/effects/Grain/Grain';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { Vec3 } from '@/types';

const WIDTH = 320;
const HEIGHT = 200;
const FIXTURE_COLOR: Vec3 = [0.09, 0.61, 0.37];
const FIXTURE_GRAIN: Vec3 = [0.88, 0.24, 0.66];

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

function uploadsOf(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

describe('Grain: real uniforms reach the GL stub and advance', () => {
    it('uploads the fixture colors and drives u_time forward across ticks', async () => {
        await mount(
            <Grain
                color={FIXTURE_COLOR}
                grainColor={FIXTURE_GRAIN}
                intensity={0.42}
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

        const color = uploadsOf('u_color').map(value => Array.from(value as Float32Array));
        expect(color.length).toBeGreaterThan(0);
        expect(color[0]).toEqual(Array.from(new Float32Array([0.09, 0.61, 0.37])));

        const grainColor = uploadsOf('u_grainColor').map(value => Array.from(value as Float32Array));
        expect(grainColor[0]).toEqual(Array.from(new Float32Array([0.88, 0.24, 0.66])));

        const intensity = uploadsOf('u_intensity') as number[];
        expect(intensity).toContain(0.42);

        const times = uploadsOf('u_time') as number[];
        expect(times.length).toBeGreaterThan(5);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThan(times[i - 1]);
        }
        expect(times[times.length - 1]).toBeLessThan(1);
    });
});
