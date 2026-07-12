import { frameToMs } from '@/react/lib/timeKeeper';
import type { SequenceOptions } from '@/types';

const LIBRARY_FPS = 60;
const DEFAULT_BITRATE = 8_000_000;
const DEFAULT_CONTAINER = 'webm';
const DEFAULT_CODEC = 'vp09.00.10.08';

export interface ResolvedSequenceOptions {
    fps: number;
    frames: number;
    startFrame: number;
    container: 'webm' | 'mp4' | 'none';
    bitrate: number;
    codec: SequenceOptions['codec'];
    seed: SequenceOptions['seed'];
    onFrame: SequenceOptions['onFrame'];
    signal: SequenceOptions['signal'];
}

export function resolveSequenceOptions(options: SequenceOptions): ResolvedSequenceOptions {
    if (!(options.fps > 0)) {
        throw new Error(`renderSequence: fps must be positive, got ${String(options.fps)}`);
    }

    const hasFrames = options.frames !== undefined;
    const hasDuration = options.durationSeconds !== undefined;
    if (hasFrames === hasDuration) {
        throw new Error('renderSequence: specify exactly one of frames or durationSeconds, not both or neither');
    }

    const frames = hasFrames ? options.frames! : Math.round(options.durationSeconds! * options.fps);
    if (!Number.isInteger(frames) || frames <= 0) {
        throw new Error(`renderSequence: resolved frame count must be a positive integer, got ${String(frames)}`);
    }

    const startFrame = options.startFrame ?? 0;
    if (!Number.isFinite(startFrame) || startFrame < 0) {
        throw new Error(`renderSequence: startFrame must be a finite number >= 0, got ${String(startFrame)}`);
    }

    if (options.startFrame !== undefined && options.seed !== undefined) {
        throw new Error(
            'renderSequence: startFrame cannot be combined with seed; the sequence step schedule defines time from the seed'
        );
    }

    const container = options.container ?? DEFAULT_CONTAINER;
    if (container === 'none' && options.onFrame === undefined) {
        throw new Error('renderSequence: container:"none" requires an onFrame callback to receive frames');
    }

    return {
        fps: options.fps,
        frames,
        startFrame,
        container,
        bitrate: options.bitrate ?? DEFAULT_BITRATE,
        codec: options.codec,
        seed: options.seed,
        onFrame: options.onFrame,
        signal: options.signal
    };
}

export function sequenceTimesMs(frames: number, fps: number, startFrame: number): number[] {
    const libraryFrameStep = LIBRARY_FPS / fps;
    return Array.from({ length: frames }, (_, i) => frameToMs(startFrame + i * libraryFrameStep));
}

export function seededTimesMs(frames: number, fps: number): number[] {
    return Array.from({ length: frames }, (_, i) => i * (1000 / fps));
}

export function frameTimestampMicros(index: number, fps: number): number {
    return Math.round((index * 1_000_000) / fps);
}

export function defaultCodecFor(_container: 'webm' | 'mp4'): string {
    return DEFAULT_CODEC;
}
