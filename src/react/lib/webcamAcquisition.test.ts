import { describe, expect, it } from 'vitest';

import type { WebcamAcquisitionDeps } from '@/react/lib/webcamAcquisition';
import { buildWebcamConstraints, createWebcamAcquisition } from '@/react/lib/webcamAcquisition';

interface FakeTrack {
    stopped: boolean;
    stop: () => void;
}

interface FakeStream {
    stream: MediaStream;
    tracks: FakeTrack[];
}

function makeStream(): FakeStream {
    const tracks: FakeTrack[] = [
        { stopped: false, stop() { this.stopped = true } },
        { stopped: false, stop() { this.stopped = true } }
    ];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    return { stream, tracks };
}

function noopDeps(overrides: Partial<WebcamAcquisitionDeps>): WebcamAcquisitionDeps {
    return {
        attach: () => undefined,
        detach: () => undefined,
        ...overrides
    };
}

describe('buildWebcamConstraints', () => {
    it('A1: always disables audio and passes the video hints through', () => {
        expect(buildWebcamConstraints()).toEqual({ video: true, audio: false });
        expect(buildWebcamConstraints({})).toEqual({ video: true, audio: false });
        expect(buildWebcamConstraints({ deviceId: 'cam-2', facingMode: 'environment', width: 1280, height: 720 }))
            .toEqual({
                video: { deviceId: 'cam-2', facingMode: 'environment', width: 1280, height: 720 },
                audio: false
            });
    });
});

describe('webcamAcquisition: releasing a grant', () => {
    it('A2: stops every track when the step after the grant throws', async () => {
        const { stream, tracks } = makeStream();
        const acquisition = createWebcamAcquisition(buildWebcamConstraints(), noopDeps({
            getUserMedia: () => Promise.resolve(stream),
            attach: () => { throw new Error('attach exploded') }
        }));

        await expect(acquisition.start()).rejects.toThrow('attach exploded');

        expect(tracks.every(track => track.stopped)).toBe(true);
        expect(acquisition.status).toBe('error');
        expect(acquisition.error).toBeInstanceOf(Error);
    });

    it('A3: a stop() during the prompt releases the grant when it lands, with no error', async () => {
        const { stream, tracks } = makeStream();
        let grant: (value: MediaStream) => void = () => undefined;
        let attaches = 0;
        const acquisition = createWebcamAcquisition(buildWebcamConstraints(), noopDeps({
            getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }),
            attach: () => { attaches += 1 }
        }));

        const starting = acquisition.start();
        expect(acquisition.status).toBe('starting');

        acquisition.stop();
        expect(acquisition.status).toBe('stopped');

        grant(stream);
        await expect(starting).resolves.toBeUndefined();

        expect(attaches).toBe(0);
        expect(tracks.every(track => track.stopped)).toBe(true);
        expect(acquisition.status).toBe('stopped');
        expect(acquisition.error).toBeNull();
    });
});

describe('webcamAcquisition: reconciling repeated starts', () => {
    it('A4: start() while starting opens the camera exactly once', async () => {
        const { stream } = makeStream();
        let calls = 0;
        const acquisition = createWebcamAcquisition(buildWebcamConstraints(), noopDeps({
            getUserMedia: () => { calls += 1; return Promise.resolve(stream) }
        }));

        const first = acquisition.start();
        const second = acquisition.start();
        expect(acquisition.status).toBe('starting');

        await Promise.all([first, second]);

        expect(calls).toBe(1);
        expect(acquisition.status).toBe('running');
    });

    it('A4: start() then stop() then start() while the prompt is open adopts the one grant it asked for', async () => {
        const { stream } = makeStream();
        let calls = 0;
        let attaches = 0;
        let grant: (value: MediaStream) => void = () => undefined;
        const acquisition = createWebcamAcquisition(buildWebcamConstraints(), noopDeps({
            getUserMedia: () => { calls += 1; return new Promise<MediaStream>(resolve => { grant = resolve }) },
            attach: () => { attaches += 1 }
        }));

        const first = acquisition.start();
        acquisition.stop();
        const third = acquisition.start();
        expect(acquisition.status).toBe('starting');

        grant(stream);
        await Promise.all([first, third]);

        expect(calls).toBe(1);
        expect(attaches).toBe(1);
        expect(acquisition.status).toBe('running');
    });
});

describe('webcamAcquisition: stopping a live camera', () => {
    it('A5: stops every track and detaches when stopped from running', async () => {
        const { stream, tracks } = makeStream();
        let detaches = 0;
        const acquisition = createWebcamAcquisition(buildWebcamConstraints(), noopDeps({
            getUserMedia: () => Promise.resolve(stream),
            detach: () => { detaches += 1 }
        }));

        await acquisition.start();
        expect(acquisition.status).toBe('running');
        expect(acquisition.stream).toBe(stream);

        acquisition.stop();

        expect(detaches).toBe(1);
        expect(tracks.every(track => track.stopped)).toBe(true);
        expect(acquisition.status).toBe('stopped');
        expect(acquisition.stream).toBeNull();
    });
});
