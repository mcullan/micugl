import { act, type ReactElement, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { GL_NEAREST, GL_UNSIGNED_BYTE } from '@/core/lib/glConstants';
import { BasePingPongShaderComponent } from '@/react/components/base/BasePingPongShaderComponent';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import type { AudioUniformsResult } from '@/react/hooks/useAudioUniforms';
import { useAudioUniforms } from '@/react/hooks/useAudioUniforms';
import type { AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import { asContext, createFakeStream, FakeContext, latestAnalyser, LOW_HALF } from '@/react/lib/fakeWebAudio';
import type { GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';
import type {
    AudioSourceSpec,
    AudioUniformsOptions,
    FramebufferOptions,
    PingPongShaderHandle,
    SequenceOptions,
    ShaderHandle,
    UniformTransitionConfig
} from '@/types';

const PROGRAM_ID = 'spring-capture';
const SECONDARY_PROGRAM_ID = 'spring-capture-secondary';
const WIDTH = 64;
const HEIGHT = 32;

const SPRING: UniformTransitionConfig = { type: 'spring', stiffness: 1200, damping: 20 };
const TWEEN: UniformTransitionConfig = { duration: 100, easing: 'linear' };

const SETTLE_TIMES = [
    1000, 1025, 1050, 1075, 1100, 1150, 1200, 1300, 1400, 1500, 1700, 1900, 1950, 2000, 2100
];

const SEQUENCE: SequenceOptions = { frames: 2, fps: 30 };

const BYTE_FRAMEBUFFERS: FramebufferOptions = {
    width: 0,
    height: 0,
    textureCount: 1,
    textureOptions: { type: GL_UNSIGNED_BYTE, minFilter: GL_NEAREST, magFilter: GL_NEAREST }
};

const CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_swirl: 'float' }
});

const AUDIO_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_audioBands: 'vec2', u_audioLevel: 'float' }
});

const MIC: AudioSourceSpec = { type: 'mic' };

const AUDIO_OPTIONS: AudioUniformsOptions = {
    bands: 2,
    fftSize: 64,
    bandLayout: 'linear',
    attack: 0.05,
    release: 0.4
};

class MediaRecorderStub {
    static isTypeSupported = (type: string): boolean => type === 'video/webm;codecs=vp9';
    state = 'inactive';
    addEventListener = (): void => undefined;
    start = (): void => { recorderStarts += 1 };
    stop = (): void => undefined;
}

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let recorderStarts = 0;
let originalGetContext: unknown;
let originalToBlob: unknown;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    stub = createGLStub();
    recorderStarts = 0;

    const canvasProto = HTMLCanvasElement.prototype as unknown as {
        getContext: unknown;
        toBlob: unknown;
    };
    originalGetContext = canvasProto.getContext;
    originalToBlob = canvasProto.toBlob;

    canvasProto.getContext = function stubGetContext(type: string): unknown {
        return type === '2d' ? { putImageData: () => undefined } : stub.gl;
    };
    canvasProto.toBlob = function stubToBlob(callback: (blob: Blob) => void, type?: string): void {
        callback(new Blob([], { type: type ?? 'image/png' }));
    };

    (stub.gl.canvas as unknown as { captureStream: () => unknown }).captureStream =
        () => ({ getTracks: () => [] });

    (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MediaRecorderStub;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();

    const canvasProto = HTMLCanvasElement.prototype as unknown as {
        getContext: unknown;
        toBlob: unknown;
    };
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;

    delete (globalThis as { ImageData?: unknown }).ImageData;
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

interface SceneProps {
    handleRef: RefObject<ShaderHandle | null>;
    value: number;
    transition: UniformTransitionConfig;
}

const Scene = ({ handleRef, value, transition }: SceneProps) => (
    <BaseShaderComponent
        ref={handleRef}
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        uniforms={{ swirl: { type: 'float', value, transition } }}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop='demand'
        reducedMotion='ignore'
        saveData='ignore'
    />
);

interface PingPongSceneProps {
    handleRef: RefObject<PingPongShaderHandle | null>;
    value: number;
}

const PingPongScene = ({ handleRef, value }: PingPongSceneProps) => (
    <BasePingPongShaderComponent
        ref={handleRef}
        programId={PROGRAM_ID}
        shaderConfig={CONFIG}
        secondaryProgramId={SECONDARY_PROGRAM_ID}
        secondaryShaderConfig={CONFIG}
        uniforms={{ swirl: { type: 'float', value: 1 } }}
        secondaryUniforms={{ swirl: { type: 'float', value, transition: SPRING } }}
        framebufferOptions={BYTE_FRAMEBUFFERS}
        width={WIDTH}
        height={HEIGHT}
        useDevicePixelRatio={false}
        frameloop='demand'
        reducedMotion='ignore'
        saveData='ignore'
    />
);

function settle(): void {
    for (const time of SETTLE_TIMES) {
        frames.tick(time);
    }
}

interface AudioFixture {
    context: FakeContext;
    deps: AudioAnalyserDriverDeps;
    hear: () => void;
}

function createAudioFixture(): AudioFixture {
    const context = new FakeContext();
    const { stream } = createFakeStream();
    return {
        context,
        deps: {
            createContext: () => asContext(context),
            getUserMedia: () => Promise.resolve(stream)
        },
        hear: () => { latestAnalyser(context).spectrum = LOW_HALF }
    };
}

interface AudioSceneProps {
    handleRef: RefObject<ShaderHandle | null>;
    probe: { current: AudioUniformsResult | null };
    deps: AudioAnalyserDriverDeps;
}

const AudioScene = ({ handleRef, probe, deps }: AudioSceneProps) => {
    const audio = useAudioUniforms(MIC, AUDIO_OPTIONS, deps);
    probe.current = audio;

    return (
        <BaseShaderComponent
            ref={handleRef}
            programId={PROGRAM_ID}
            shaderConfig={AUDIO_CONFIG}
            uniforms={audio.uniforms}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop='demand'
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
};

function currentAudio(probe: { current: AudioUniformsResult | null }): AudioUniformsResult {
    const value = probe.current;
    if (!value) {
        throw new Error('the audio scene has not rendered yet');
    }
    return value;
}

describe('deterministic capture with a spring transition in flight, through mounted components', () => {
    it('renderSequence throws while a spring is in flight, and the message says why', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        await mount(<Scene handleRef={handleRef} value={0} transition={SPRING} />);
        frames.tick(0);

        await mount(<Scene handleRef={handleRef} value={10} transition={SPRING} />);
        frames.tick(1000);
        expect(frames.pending()).toBe(1);

        expect(() => handleRef.current?.renderSequence(SEQUENCE))
            .toThrow(/ShaderEngine\.renderSequence: a spring transition is still in flight/);
        expect(() => handleRef.current?.renderSequence(SEQUENCE)).toThrow(/would not reproduce/);
    });

    it('renderToBlob({ frame }) rejects while a spring is in flight, and never reaches the pixel read', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        await mount(<Scene handleRef={handleRef} value={0} transition={SPRING} />);
        frames.tick(0);

        await mount(<Scene handleRef={handleRef} value={10} transition={SPRING} />);
        frames.tick(1000);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/ShaderEngine\.renderToBlob: a spring transition is still in flight/);
        expect(stub.readPixelsCalls.length).toBe(0);

        expect(() => handleRef.current?.renderToDataURL({ frame: 30 }))
            .toThrow(/a spring transition is still in flight/);
    });

    it('the same spring, once settled, exports an explicit frame: the capture reads pixels and resolves to a Blob', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        await mount(<Scene handleRef={handleRef} value={0} transition={SPRING} />);
        frames.tick(0);

        await mount(<Scene handleRef={handleRef} value={10} transition={SPRING} />);
        settle();
        expect(frames.pending()).toBe(0);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        await expect(handleRef.current?.renderSequence(SEQUENCE)).rejects.toThrow(/WebCodecs|VideoEncoder/);
    });

    it('an in-flight tween is deterministic under setFrame, so it does not block a capture', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        await mount(<Scene handleRef={handleRef} value={0} transition={TWEEN} />);
        frames.tick(0);

        await mount(<Scene handleRef={handleRef} value={10} transition={TWEEN} />);
        frames.tick(1000);
        expect(frames.pending()).toBe(1);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        await expect(handleRef.current?.renderSequence(SEQUENCE)).rejects.toThrow(/WebCodecs|VideoEncoder/);
    });

    it('a live capture of a spring in flight is honest, so renderToBlob() with no frame and record() both run', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        await mount(<Scene handleRef={handleRef} value={0} transition={SPRING} />);
        frames.tick(0);

        await mount(<Scene handleRef={handleRef} value={10} transition={SPRING} />);
        frames.tick(1000);

        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/still in flight/);

        stub.reset();
        await expect(handleRef.current?.renderToBlob()).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        const recording = handleRef.current?.record();
        expect(recording?.stream).toBeDefined();
        expect(recorderStarts).toBe(1);
    });

    it('a spring on the secondary program of a ping-pong chain trips the guard too', async () => {
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };
        await mount(<PingPongScene handleRef={handleRef} value={0} />);
        frames.tick(0);

        await mount(<PingPongScene handleRef={handleRef} value={10} />);
        frames.tick(1000);
        expect(frames.pending()).toBe(1);

        expect(() => handleRef.current?.renderSequence(SEQUENCE))
            .toThrow(/PingPongShaderEngine\.renderSequence: a spring transition is still in flight/);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/PingPongShaderEngine\.renderToBlob: a spring transition is still in flight/);
        expect(stub.readPixelsCalls.length).toBe(0);

        await expect(handleRef.current?.renderToBlob({ seed: { kind: 'clear', color: [0, 0, 0, 1] }, steps: 4 }))
            .rejects.toThrow(/a spring transition is still in flight/);
    });

    it('the same ping-pong secondary spring, once settled, exports an explicit frame', async () => {
        const handleRef: RefObject<PingPongShaderHandle | null> = { current: null };
        await mount(<PingPongScene handleRef={handleRef} value={0} />);
        frames.tick(0);

        await mount(<PingPongScene handleRef={handleRef} value={10} />);
        settle();
        expect(frames.pending()).toBe(0);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);
    });
});

describe('deterministic capture with a live audio input, through mounted components', () => {
    it('renderSequence throws while the audio is running, and the message names the audio, not a spring', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const fixture = createAudioFixture();

        await mount(<AudioScene handleRef={handleRef} probe={probe} deps={fixture.deps} />);
        frames.tick(0);

        await act(async () => { await currentAudio(probe).start() });
        fixture.hear();
        frames.tick(16);

        expect(() => handleRef.current?.renderSequence(SEQUENCE))
            .toThrow(/ShaderEngine\.renderSequence: audio is running/);
        expect(() => handleRef.current?.renderSequence(SEQUENCE)).toThrow(/would not reproduce/);
        expect(() => handleRef.current?.renderSequence(SEQUENCE)).toThrow(/Call stop\(\) on the audio hook/);
        expect(() => handleRef.current?.renderSequence(SEQUENCE)).not.toThrow(/spring/);
    });

    it('renderToBlob({ frame }) rejects while the audio is running, and never reaches the pixel read', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const fixture = createAudioFixture();

        await mount(<AudioScene handleRef={handleRef} probe={probe} deps={fixture.deps} />);
        frames.tick(0);

        await act(async () => { await currentAudio(probe).start() });
        fixture.hear();
        frames.tick(16);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 }))
            .rejects.toThrow(/ShaderEngine\.renderToBlob: audio is running/);
        expect(stub.readPixelsCalls.length).toBe(0);

        expect(() => handleRef.current?.renderToDataURL({ frame: 30 })).toThrow(/audio is running/);
    });

    it('a stopped audio scene captures fine: the guard asks the driver, it is not a static flag on the uniform', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const fixture = createAudioFixture();

        await mount(<AudioScene handleRef={handleRef} probe={probe} deps={fixture.deps} />);
        frames.tick(0);

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        await act(async () => { await currentAudio(probe).start() });
        fixture.hear();
        frames.tick(16);
        expect(currentAudio(probe).status).toBe('running');

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        act(() => { currentAudio(probe).stop() });
        expect(currentAudio(probe).status).toBe('stopped');

        stub.reset();
        await expect(handleRef.current?.renderToBlob({ frame: 30 })).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        await expect(handleRef.current?.renderSequence(SEQUENCE)).rejects.toThrow(/WebCodecs|VideoEncoder/);
    });

    it('a live capture of running audio is honest, so renderToBlob() with no frame and record() both run', async () => {
        const handleRef: RefObject<ShaderHandle | null> = { current: null };
        const probe: { current: AudioUniformsResult | null } = { current: null };
        const fixture = createAudioFixture();

        await mount(<AudioScene handleRef={handleRef} probe={probe} deps={fixture.deps} />);
        frames.tick(0);

        await act(async () => { await currentAudio(probe).start() });
        fixture.hear();
        frames.tick(16);

        await expect(handleRef.current?.renderToBlob({ frame: 30 })).rejects.toThrow(/audio is running/);

        stub.reset();
        await expect(handleRef.current?.renderToBlob()).resolves.toBeInstanceOf(Blob);
        expect(stub.readPixelsCalls.length).toBe(1);

        const recording = handleRef.current?.record();
        expect(recording?.stream).toBeDefined();
        expect(recorderStarts).toBe(1);
    });
});
