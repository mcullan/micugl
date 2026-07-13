import { act, Component, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { VideoInput, VideoTextureDeps } from '@/react/hooks/useVideoTexture';
import { useVideoTexture } from '@/react/hooks/useVideoTexture';
import type { FakeVideo } from '@/react/lib/fakeVideo';
import { asVideoElement, makeFakeVideo, makeRvfcScheduler } from '@/react/lib/fakeVideo';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';

const PROGRAM_ID = 'video-demo';
const WIDTH = 320;
const HEIGHT = 200;

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub({ extensions: { ANGLE_instanced_arrays: true } });

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    originalGetContext = canvasProto.getContext;
    originalToBlob = canvasProto.toBlob;
    canvasProto.getContext = function stubGetContext(type: string): unknown {
        return type === '2d' ? { putImageData: () => undefined, drawImage: () => undefined } : stub.gl;
    };
    canvasProto.toBlob = function stubToBlob(callback: (blob: Blob) => void, type?: string): void {
        callback(new Blob([], { type: type ?? 'image/png' }));
    };

    originalMatchMedia = window.matchMedia;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;
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

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_color: 'float' }
});

function fullUploads(): { width: number; height: number }[] {
    return stub.texImage2DCalls
        .filter(call => call.width !== 1 || call.height !== 1)
        .map(call => ({ width: call.width, height: call.height }));
}

function count(name: string): number {
    return stub.calls.filter(call => call.name === name).length;
}

function uploadCount(): number {
    return fullUploads().length + stub.texSubImage2DCalls.length;
}

interface SceneProps {
    input: VideoInput | null;
    deps: VideoTextureDeps;
    onError?: (error: unknown) => void;
    statuses?: string[];
    reducedMotion?: 'static-frame' | 'pause' | 'ignore';
    frameloop?: 'always' | 'demand' | 'never';
}

const VideoScene = ({ input, deps, onError, statuses, reducedMotion, frameloop }: SceneProps) => {
    const video = useVideoTexture(input, { deps, onError });
    statuses?.push(video.status);
    return (
        <BaseShaderComponent
            programId={PROGRAM_ID}
            shaderConfig={CONFIG}
            uniforms={{ u_color: { type: 'float', value: 0.5 } }}
            textures={{ cam: video.texture }}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop={frameloop}
            reducedMotion={reducedMotion}
            saveData='ignore'
        />
    );
};

class ErrorBoundary extends Component<{ children: ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        this.props.onError(error);
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children;
    }
}

describe('useVideoTexture: kind honesty under a reduced-motion gate (H4)', () => {
    it('paints one poster on the first decoded frame and suppresses the continuous frames after it', async () => {
        mockReducedMotionActive();
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        };

        await mount(<VideoScene input={asVideoElement(video)} deps={deps} />);

        act(() => { frames.tick(0) });
        const posters = count('drawArrays');
        expect(posters).toBeGreaterThan(0);

        act(() => { rvfc.fire() });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });
        expect(count('drawArrays')).toBe(posters + 1);
        expect(fullUploads()).toEqual([{ width: 640, height: 480 }]);

        for (let i = 0; i < 4; i++) {
            act(() => { rvfc.fire() });
            expect(frames.pending()).toBe(0);
        }
        expect(fullUploads()).toEqual([{ width: 640, height: 480 }]);
    });

    it('uploads every decoded frame when reduced motion is ignored', async () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        };

        await mount(<VideoScene input={asVideoElement(video)} deps={deps} reducedMotion='ignore' frameloop='demand' />);
        act(() => { frames.tick(0) });
        const base = uploadCount();

        for (let i = 1; i <= 3; i++) {
            act(() => { rvfc.fire() });
            expect(frames.pending()).toBe(1);
            act(() => { frames.tick(16 * i) });
        }

        expect(uploadCount()).toBe(base + 3);
    });
});

const WAKE_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_color: 'float', u_wake: 'float' }
});

describe('useVideoTexture: demand mode (H5)', () => {
    it('wakes one render and one upload per decoded frame, and does not re-upload on a render woken with no new frame', async () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const element = asVideoElement(video);
        const wake = createFrameInvalidation();
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        };

        const Scene = () => {
            const source = useVideoTexture(element, { deps });
            return (
                <BaseShaderComponent
                    programId={PROGRAM_ID}
                    shaderConfig={WAKE_CONFIG}
                    uniforms={{
                        u_color: { type: 'float', value: 0.5 },
                        u_wake: { type: 'float', value: 0.5, invalidation: wake }
                    }}
                    textures={{ cam: source.texture }}
                    width={WIDTH}
                    height={HEIGHT}
                    useDevicePixelRatio={false}
                    frameloop='demand'
                    reducedMotion='ignore'
                    saveData='ignore'
                />
            );
        };

        await mount(<Scene />);
        act(() => { frames.tick(0) });

        act(() => { rvfc.fire() });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(16) });
        const uploadsBefore = uploadCount();
        expect(uploadsBefore).toBeGreaterThan(0);
        const draws = count('drawArrays');

        act(() => { wake.request('discrete') });
        expect(frames.pending()).toBe(1);
        act(() => { frames.tick(32) });

        expect(count('drawArrays')).toBe(draws + 1);
        expect(uploadCount()).toBe(uploadsBefore);
    });
});

describe('useVideoTexture: the adopted-element contract (H10)', () => {
    it('never plays or pauses a caller-owned video, yet still pumps and uploads its frames', async () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel,
            createVideo: () => { throw new Error('an adopted element must never be re-created') }
        };

        await mount(<VideoScene input={asVideoElement(video)} deps={deps} reducedMotion='ignore' frameloop='demand' />);
        act(() => { frames.tick(0) });

        act(() => { rvfc.fire() });
        act(() => { frames.tick(16) });

        expect(fullUploads()).toHaveLength(1);
        expect(video.playCalls).toBe(0);
        expect(video.pauseCalls).toBe(0);
    });
});

describe('useVideoTexture: the error surface (H9)', () => {
    it('re-throws a URL video error during render when no onError is supplied', async () => {
        const rvfc = makeRvfcScheduler();
        let created: FakeVideo | null = null;
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel,
            createVideo: () => { created = makeFakeVideo({ readyState: 0, videoWidth: 0, videoHeight: 0 }); return asVideoElement(created) }
        };
        let boundaryError: unknown = null;

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <VideoScene input='https://example.test/clip.mp4' deps={deps} reducedMotion='ignore' frameloop='demand' />
            </ErrorBoundary>
        );

        expect(created).not.toBeNull();
        await act(async () => {
            (created as unknown as FakeVideo).error = { code: 4 };
            (created as unknown as FakeVideo).emitError();
            await Promise.resolve();
        });

        expect(boundaryError).toBeInstanceOf(Error);
        expect((boundaryError as Error).message).toContain('failed to load');
    });

    it('reports a URL video error through onError without throwing when one is supplied', async () => {
        const rvfc = makeRvfcScheduler();
        let created: FakeVideo | null = null;
        const deps: VideoTextureDeps = {
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel,
            createVideo: () => { created = makeFakeVideo({ readyState: 0, videoWidth: 0, videoHeight: 0 }); return asVideoElement(created) }
        };
        const reports: unknown[] = [];
        let boundaryError: unknown = null;

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <VideoScene
                    input='https://example.test/clip.mp4'
                    deps={deps}
                    onError={error => { reports.push(error) }}
                    reducedMotion='ignore'
                    frameloop='demand'
                />
            </ErrorBoundary>
        );

        await act(async () => {
            (created as unknown as FakeVideo).emitError();
            await Promise.resolve();
        });

        expect(boundaryError).toBeNull();
        expect(reports).toHaveLength(1);
        expect(reports[0]).toBeInstanceOf(Error);
    });
});
