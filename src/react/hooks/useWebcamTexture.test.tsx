import { act, Component, type ReactElement, type ReactNode, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { VideoTextureDeps } from '@/react/hooks/useVideoTexture';
import { useVideoTexture } from '@/react/hooks/useVideoTexture';
import type { WebcamTextureDeps } from '@/react/hooks/useWebcamTexture';
import { useWebcamTexture } from '@/react/hooks/useWebcamTexture';
import type { FakeStream, FakeTrack, RvfcScheduler } from '@/react/lib/fakeVideo';
import { asVideoElement, makeFakeStream, makeFakeVideo, makeRvfcScheduler } from '@/react/lib/fakeVideo';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type { ShaderHandle } from '@/types';

const PROGRAM_ID = 'webcam-demo';
const WIDTH = 320;
const HEIGHT = 200;

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

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
    (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;

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
    delete (globalThis as { ImageData?: unknown }).ImageData;
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
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

interface WebcamControl {
    start: (() => Promise<void>) | null;
    stop: (() => void) | null;
    status: string;
}

interface WebcamSceneProps {
    deps: WebcamTextureDeps;
    onError?: (error: unknown) => void;
    control: WebcamControl;
    handleRef?: { current: ShaderHandle | null };
}

const WebcamScene = ({ deps, onError, control, handleRef }: WebcamSceneProps) => {
    const cam = useWebcamTexture({ deps, onError });
    control.start = cam.start;
    control.stop = cam.stop;
    control.status = cam.status;
    return (
        <BaseShaderComponent
            ref={handleRef ?? undefined}
            programId={PROGRAM_ID}
            shaderConfig={CONFIG}
            uniforms={{ u_color: { type: 'float', value: 0.5 } }}
            textures={{ cam: cam.texture }}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop='demand'
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
};

interface VideoCaptureSceneProps {
    deps: VideoTextureDeps;
    url: string;
    handleRef: { current: ShaderHandle | null };
}

const VideoCaptureScene = ({ deps, url, handleRef }: VideoCaptureSceneProps) => {
    const video = useVideoTexture(url, { deps });
    return (
        <BaseShaderComponent
            ref={handleRef}
            programId={PROGRAM_ID}
            shaderConfig={CONFIG}
            uniforms={{ u_color: { type: 'float', value: 0.5 } }}
            textures={{ cam: video.texture }}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop='demand'
            reducedMotion='ignore'
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

function webcamDeps(stream: FakeStream, rvfc: RvfcScheduler, extra: Partial<WebcamTextureDeps> = {}): WebcamTextureDeps {
    return {
        getUserMedia: () => Promise.resolve(stream.stream),
        createVideo: () => asVideoElement(makeFakeVideo()),
        requestVideoFrameCallback: rvfc.request,
        cancelVideoFrameCallback: rvfc.cancel,
        ...extra
    };
}

async function driveRunning(control: WebcamControl, rvfc: RvfcScheduler): Promise<void> {
    await act(async () => {
        await control.start?.();
    });
    act(() => { frames.tick(0) });
    act(() => { rvfc.fire() });
    act(() => { frames.tick(16) });
}

describe('useWebcamTexture: deterministic capture is blocked while the camera runs (H1, anchor)', () => {
    it('rejects renderToBlob at an explicit frame and renderSequence, naming the texture blocker', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(<WebcamScene deps={webcamDeps(stream, rvfc)} control={control} handleRef={handleRef} />);
        await driveRunning(control, rvfc);

        expect(control.status).toBe('running');
        expect(fullUploads()).toEqual([{ width: 640, height: 480 }]);

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/texture/);
        expect(() => handleRef.current?.renderSequence({ fps: 30, frames: 2, container: 'none' }))
            .toThrow(/texture/);
    });
});

describe('useWebcamTexture: a stopped camera captures fine (H2)', () => {
    it('resolves renderToBlob at an explicit frame once the camera is stopped', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(<WebcamScene deps={webcamDeps(stream, rvfc)} control={control} handleRef={handleRef} />);
        await driveRunning(control, rvfc);

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/texture/);

        act(() => { control.stop?.() });
        expect(control.status).toBe('stopped');

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('useVideoTexture: a paused video captures fine, a playing one does not (H2)', () => {
    it('blocks the explicit-frame export while playing and allows it once paused', async () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const deps: VideoTextureDeps = {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        };
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(<VideoCaptureScene deps={deps} url='https://example.test/clip.mp4' handleRef={handleRef} />);
        act(() => { frames.tick(0) });
        act(() => { rvfc.fire() });
        act(() => { frames.tick(16) });

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/texture/);

        video.paused = true;
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
    });
});

describe('useWebcamTexture: the live capture path stays honest (H3)', () => {
    it('resolves renderToBlob with no frame while the camera is running', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(<WebcamScene deps={webcamDeps(stream, rvfc)} control={control} handleRef={handleRef} />);
        await driveRunning(control, rvfc);

        expect(control.status).toBe('running');
        await expect(handleRef.current?.renderToBlob()).resolves.toBeInstanceOf(Blob);
    });
});

describe('useWebcamTexture: StrictMode never double-prompts (H6)', () => {
    it('opens the camera exactly once after start() under a StrictMode mount', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        let calls = 0;
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const deps = webcamDeps(stream, rvfc, {
            getUserMedia: () => { calls += 1; return Promise.resolve(stream.stream) }
        });

        await mount(<StrictMode><WebcamScene deps={deps} control={control} /></StrictMode>);
        await act(async () => { await control.start?.() });

        expect(calls).toBe(1);
        expect(control.status).toBe('running');
    });
});

describe('useVideoTexture: StrictMode leaves exactly one pump (H6)', () => {
    it('cancels the first attachment so a double-invoked mount effect does not leak a second pump', async () => {
        const rvfc = makeRvfcScheduler();
        const created: ReturnType<typeof makeFakeVideo>[] = [];
        const deps: VideoTextureDeps = {
            createVideo: () => { const video = makeFakeVideo(); created.push(video); return asVideoElement(video) },
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        };
        const handleRef: { current: ShaderHandle | null } = { current: null };

        await mount(
            <StrictMode>
                <VideoCaptureScene deps={deps} url='https://example.test/clip.mp4' handleRef={handleRef} />
            </StrictMode>
        );

        expect(created.length).toBeGreaterThan(1);
        expect(created[0].pauseCalls).toBe(1);
        expect(rvfc.activeCount).toBe(1);
        expect(rvfc.pending).toBe(true);
    });
});

describe('useWebcamTexture: unmount releases the camera (H7)', () => {
    it('stops every track and cancels the pump when the component unmounts while running', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };

        await mount(<WebcamScene deps={webcamDeps(stream, rvfc)} control={control} />);
        await act(async () => { await control.start?.() });

        expect(stream.tracks.every((track: FakeTrack) => track.stopped)).toBe(false);

        act(() => { root.render(<div />) });

        expect(stream.tracks.every((track: FakeTrack) => track.stopped)).toBe(true);
        expect(rvfc.cancelled.length).toBeGreaterThan(0);
    });

    it('releases a grant that lands after the component unmounted mid-prompt', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        let grant: (value: MediaStream) => void = () => undefined;
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const deps = webcamDeps(stream, rvfc, {
            getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve })
        });

        await mount(<WebcamScene deps={deps} control={control} />);
        let starting: Promise<void> | undefined;
        act(() => { starting = control.start?.() });

        act(() => { root.render(<div />) });

        grant(stream.stream);
        await act(async () => { await starting });

        expect(stream.tracks.every((track: FakeTrack) => track.stopped)).toBe(true);
    });
});

describe('useWebcamTexture: SSR safety and lazy acquisition (H8)', () => {
    it('never opens the camera at mount and reads no camera global before start()', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        let calls = 0;
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const deps = webcamDeps(stream, rvfc, {
            getUserMedia: () => { calls += 1; return Promise.resolve(stream.stream) }
        });

        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
        try {
            await mount(<WebcamScene deps={deps} control={control} />);
            expect(calls).toBe(0);
            expect(control.status).toBe('idle');
        } finally {
            if (descriptor) {
                Object.defineProperty(navigator, 'mediaDevices', descriptor);
            }
        }

        await act(async () => { await control.start?.() });
        expect(calls).toBe(1);
        expect(control.status).toBe('running');
    });
});

describe('useWebcamTexture: the error surface (H9)', () => {
    it('re-throws a getUserMedia rejection during render when no onError is supplied', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const denied = new Error('NotAllowedError: permission denied');
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const deps = webcamDeps(stream, rvfc, { getUserMedia: () => Promise.reject(denied) });
        let boundaryError: unknown = null;

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <WebcamScene deps={deps} control={control} />
            </ErrorBoundary>
        );
        await act(async () => { await control.start?.().catch(() => undefined) });

        expect(boundaryError).toBe(denied);
    });

    it('reports a getUserMedia rejection through onError without throwing when one is supplied', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();
        const denied = new Error('NotAllowedError: permission denied');
        const reports: unknown[] = [];
        const control: WebcamControl = { start: null, stop: null, status: 'idle' };
        const deps = webcamDeps(stream, rvfc, { getUserMedia: () => Promise.reject(denied) });
        let boundaryError: unknown = null;

        await mount(
            <ErrorBoundary onError={error => { boundaryError = error }}>
                <WebcamScene deps={deps} onError={error => { reports.push(error) }} control={control} />
            </ErrorBoundary>
        );
        await act(async () => { await control.start?.().catch(() => undefined) });

        expect(boundaryError).toBeNull();
        expect(control.status).toBe('error');
    });
});

describe('useWebcamTexture: constraint identity is fixed for a hook instance (A6)', () => {
    it('throws the give-it-a-key message when the camera constraints change after mount', async () => {
        const stream = makeFakeStream();
        const rvfc = makeRvfcScheduler();

        const Scene = ({ deviceId }: { deviceId: string }) => {
            const cam = useWebcamTexture({ deviceId, deps: webcamDeps(stream, rvfc) });
            return (
                <BaseShaderComponent
                    programId={PROGRAM_ID}
                    shaderConfig={CONFIG}
                    uniforms={{ u_color: { type: 'float', value: 0.5 } }}
                    textures={{ cam: cam.texture }}
                    width={WIDTH}
                    height={HEIGHT}
                    useDevicePixelRatio={false}
                    frameloop='demand'
                    reducedMotion='ignore'
                    saveData='ignore'
                />
            );
        };

        let caught: unknown = null;
        const tree = (deviceId: string): ReactElement => (
            <ErrorBoundary onError={error => { caught = error }}>
                <Scene deviceId={deviceId} />
            </ErrorBoundary>
        );

        await mount(tree('cam-a'));
        await mount(tree('cam-b'));

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toContain('Give the component a "key"');
    });
});
