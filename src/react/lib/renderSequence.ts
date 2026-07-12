import type * as Mp4MuxerModule from 'mp4-muxer';
import type * as WebmMuxerModule from 'webm-muxer';

import {
    defaultCodecFor,
    frameTimestampMicros,
    resolveSequenceOptions,
    seededTimesMs,
    sequenceTimesMs
} from '@/react/lib/sequenceSchedule';
import type { SequenceOptions, Vec4 } from '@/types';

export interface RenderSequenceDeps {
    canvas: HTMLCanvasElement;
    renderAtMs: (timeMs: number) => void;
    reset?: (color?: Vec4) => void;
    isTimePure?: () => boolean;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (!signal?.aborted) {
        return;
    }
    if (typeof DOMException === 'function') {
        throw new DOMException('renderSequence aborted', 'AbortError');
    }
    throw new Error('renderSequence aborted');
}

function webmVideoCodecId(codec: string): string {
    if (codec.startsWith('vp09') || codec.startsWith('vp9')) return 'V_VP9';
    if (codec.startsWith('vp8')) return 'V_VP8';
    if (codec.startsWith('av01')) return 'V_AV1';
    throw new Error(`renderSequence: no webm muxer codec mapping for codec "${codec}"`);
}

function mp4VideoCodecId(codec: string): 'avc' | 'hevc' | 'vp9' | 'av1' {
    if (codec.startsWith('vp09') || codec.startsWith('vp9')) return 'vp9';
    if (codec.startsWith('av01')) return 'av1';
    if (codec.startsWith('avc1')) return 'avc';
    if (codec.startsWith('hev1') || codec.startsWith('hvc1')) return 'hevc';
    throw new Error(`renderSequence: no mp4 muxer codec mapping for codec "${codec}"`);
}

function runRawFrameSequence(
    deps: RenderSequenceDeps,
    frames: number,
    fps: number,
    signal: AbortSignal | undefined,
    onFrame: NonNullable<SequenceOptions['onFrame']>,
    times: number[]
): Promise<null> {
    if (typeof VideoFrame !== 'function') {
        throw new Error(
            'renderSequence: VideoFrame is not available; this requires a secure context (localhost/https) in a supporting browser'
        );
    }

    for (let i = 0; i < frames; i++) {
        throwIfAborted(signal);

        deps.renderAtMs(times[i]);
        const frame = new VideoFrame(deps.canvas, { timestamp: frameTimestampMicros(i, fps) });
        try {
            onFrame(frame, i);
        } finally {
            frame.close();
        }
    }

    return Promise.resolve(null);
}

async function runEncodedSequence(
    deps: RenderSequenceDeps,
    frames: number,
    fps: number,
    signal: AbortSignal | undefined,
    onFrame: SequenceOptions['onFrame'],
    times: number[],
    container: 'webm' | 'mp4',
    requestedCodec: string | undefined,
    bitrate: number
): Promise<Blob> {
    if (typeof VideoEncoder === 'undefined') {
        throw new Error(
            'renderSequence requires WebCodecs (VideoEncoder), which is only available in secure contexts (localhost/https) in supporting browsers'
        );
    }

    const codec = requestedCodec ?? defaultCodecFor(container);
    const width = deps.canvas.width;
    const height = deps.canvas.height;

    const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps
    };

    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
        const hint = codec.startsWith('avc1')
            ? ' Chromium builds often lack H.264 (avc1) encode; use a VP9 or AV1 codec instead, or the ffmpeg recipe in the README.'
            : '';
        throw new Error(
            `renderSequence: codec "${codec}" is not supported for ${container} at ${String(width)}x${String(height)}.${hint}`
        );
    }

    let addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
    let finalizeMuxer: () => ArrayBuffer;
    const mimeType = container === 'webm' ? 'video/webm' : 'video/mp4';

    if (container === 'webm') {
        let webmModule: typeof WebmMuxerModule;
        try {
            webmModule = await import('webm-muxer');
        } catch {
            throw new Error(
                'renderSequence: install webm-muxer (or mp4-muxer) as a dependency to produce container output, or use container:"none" with onFrame'
            );
        }
        const target = new webmModule.ArrayBufferTarget();
        const muxer = new webmModule.Muxer({
            target,
            video: { codec: webmVideoCodecId(codec), width, height, frameRate: fps }
        });
        addVideoChunk = (chunk, meta) => { muxer.addVideoChunk(chunk, meta) };
        finalizeMuxer = () => {
            muxer.finalize();
            return target.buffer;
        };
    } else {
        let mp4Module: typeof Mp4MuxerModule;
        try {
            mp4Module = await import('mp4-muxer');
        } catch {
            throw new Error(
                'renderSequence: install webm-muxer (or mp4-muxer) as a dependency to produce container output, or use container:"none" with onFrame'
            );
        }
        const target = new mp4Module.ArrayBufferTarget();
        const muxer = new mp4Module.Muxer({
            target,
            video: { codec: mp4VideoCodecId(codec), width, height, frameRate: fps },
            fastStart: 'in-memory'
        });
        addVideoChunk = (chunk, meta) => { muxer.addVideoChunk(chunk, meta) };
        finalizeMuxer = () => {
            muxer.finalize();
            return target.buffer;
        };
    }

    const encoderState: { error: DOMException | null } = { error: null };
    const readEncoderError = (): DOMException | null => encoderState.error;

    const encoder = new VideoEncoder({
        output: (chunk, meta) => { addVideoChunk(chunk, meta) },
        error: error => { encoderState.error = error }
    });
    encoder.configure(config);

    try {
        for (let i = 0; i < frames; i++) {
            throwIfAborted(signal);
            const errorBeforeRender = readEncoderError();
            if (errorBeforeRender) throw errorBeforeRender;

            if (encoder.encodeQueueSize > 16) {
                await new Promise<Event>(resolve => {
                    encoder.addEventListener('dequeue', resolve, { once: true });
                });
            }
            const errorAfterBackpressure = readEncoderError();
            if (errorAfterBackpressure) throw errorAfterBackpressure;

            deps.renderAtMs(times[i]);
            const frame = new VideoFrame(deps.canvas, { timestamp: frameTimestampMicros(i, fps) });
            try {
                onFrame?.(frame, i);
                encoder.encode(frame, { keyFrame: i % 120 === 0 });
            } finally {
                frame.close();
            }
        }

        await encoder.flush();
        const errorAfterFlush = readEncoderError();
        if (errorAfterFlush) throw errorAfterFlush;

        encoder.close();
        const buffer = finalizeMuxer();
        return new Blob([buffer], { type: mimeType });
    } catch (err) {
        try {
            if (encoder.state !== 'closed') {
                encoder.close();
            }
        } catch (closeError) {
            void closeError;
        }
        throw err;
    }
}

export async function runRenderSequence(deps: RenderSequenceDeps, options: SequenceOptions): Promise<Blob | null> {
    const resolved = resolveSequenceOptions(options);

    const timePure = deps.isTimePure ? deps.isTimePure() : true;
    if (!timePure && resolved.seed === undefined) {
        throw new Error(
            'renderSequence: accumulating simulations cannot be replayed deterministically without a seed; ' +
            'provide seed (the sequence steps define time from the seed)'
        );
    }
    if (resolved.seed !== undefined && !deps.reset) {
        throw new Error('renderSequence: no simulation to seed');
    }

    const useSeeded = resolved.seed !== undefined || !timePure;
    if (useSeeded) {
        deps.reset!(resolved.seed?.color);
    }

    const times = useSeeded
        ? seededTimesMs(resolved.frames, resolved.fps)
        : sequenceTimesMs(resolved.frames, resolved.fps, resolved.startFrame);

    if (resolved.container === 'none') {
        return runRawFrameSequence(
            deps,
            resolved.frames,
            resolved.fps,
            resolved.signal,
            resolved.onFrame!,
            times
        );
    }

    return runEncodedSequence(
        deps,
        resolved.frames,
        resolved.fps,
        resolved.signal,
        resolved.onFrame,
        times,
        resolved.container,
        resolved.codec,
        resolved.bitrate
    );
}
