import { selectRecordingMimeType } from '@/react/lib/mimeType';
import type { Recording, RecordOptions } from '@/types';

export function createRecording(canvas: HTMLCanvasElement, options: RecordOptions = {}): Recording {
    if (typeof canvas.captureStream !== 'function') {
        throw new Error('createRecording: this canvas does not support captureStream');
    }
    if (typeof MediaRecorder === 'undefined') {
        throw new Error('createRecording: MediaRecorder is not available in this environment');
    }

    const mimeType = selectRecordingMimeType(type => MediaRecorder.isTypeSupported(type), options.mimeType);
    const stream = canvas.captureStream(options.fps ?? 60);
    const recorder = new MediaRecorder(stream, {
        mimeType,
        ...(options.videoBitsPerSecond !== undefined ? { videoBitsPerSecond: options.videoBitsPerSecond } : {})
    });

    const chunks: Blob[] = [];
    let settled = false;

    recorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
            chunks.push(event.data);
        }
    });

    const stopTracks = (): void => {
        stream.getTracks().forEach(track => { track.stop() });
    };

    recorder.start();

    const stop = (): Promise<Blob> => {
        if (settled) {
            return Promise.reject(new Error('createRecording: stop() was already called on this recording'));
        }

        return new Promise<Blob>((resolve, reject) => {
            recorder.addEventListener('stop', () => {
                settled = true;
                stopTracks();
                resolve(new Blob(chunks, { type: mimeType }));
            }, { once: true });

            recorder.addEventListener('error', event => {
                settled = true;
                stopTracks();
                reject(new Error(`createRecording: MediaRecorder error: ${event.message || 'unknown error'}`));
            }, { once: true });

            recorder.stop();
        });
    };

    const cancel = (): void => {
        if (settled) {
            return;
        }
        settled = true;
        chunks.length = 0;
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }
        stopTracks();
    };

    return { stream, stop, cancel };
}
