import { afterEach, describe, expect, it } from 'vitest';

import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import type { FakeVideo } from '@/react/lib/fakeVideo';
import { asVideoElement, makeFakeVideo, makeRvfcScheduler } from '@/react/lib/fakeVideo';
import type { VideoTextureDriverConfig } from '@/react/lib/videoTextureDriver';
import { createVideoTextureDriver } from '@/react/lib/videoTextureDriver';

interface RafScheduler {
    request: (callback: (now: number) => void) => number;
    cancel: (handle: number) => void;
    fire: (now?: number) => void;
    readonly cancelled: number[];
}

function makeRafScheduler(): RafScheduler {
    let callback: ((now: number) => void) | null = null;
    let handle = 0;
    const cancelled: number[] = [];
    return {
        request: cb => {
            callback = cb;
            handle += 1;
            return handle;
        },
        cancel: h => {
            cancelled.push(h);
            callback = null;
        },
        fire: (now = 0) => {
            const current = callback;
            callback = null;
            current?.(now);
        },
        get cancelled() { return cancelled }
    };
}

function config(overrides: Partial<VideoTextureDriverConfig> = {}): VideoTextureDriverConfig {
    return {
        crossOrigin: 'anonymous',
        loop: false,
        resizeToPOT: false,
        ...overrides
    };
}

const STREAM = { getTracks: () => [] } as unknown as MediaStream;

function flushMicrotasks(): Promise<void> {
    return Promise.resolve().then(() => undefined).then(() => undefined);
}

let activeError: unknown = null;
afterEach(() => {
    activeError = null;
});

describe('videoTextureDriver: the requestVideoFrameCallback pump', () => {
    it('D1: advances the version once per decoded frame and emits discrete then continuous kinds', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });
        const kinds: InvalidationKind[] = [];
        driver.invalidation.connect(kind => { kinds.push(kind) });

        driver.start(STREAM);
        expect(rvfc.pending).toBe(true);

        rvfc.fire();
        rvfc.fire();
        rvfc.fire();

        expect(driver.version).toBe(3);
        expect(kinds).toEqual(['discrete', 'continuous', 'continuous']);
        expect(driver.status).toBe('ready');
    });
});

describe('videoTextureDriver: the requestAnimationFrame fallback pump', () => {
    it('D2: pumps only while the element is playing, and keeps the same discrete-then-continuous protocol', () => {
        const raf = makeRafScheduler();
        const video = makeFakeVideo({ paused: true });
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestAnimationFrame: raf.request,
            cancelAnimationFrame: raf.cancel
        });
        const kinds: InvalidationKind[] = [];
        driver.invalidation.connect(kind => { kinds.push(kind) });

        driver.start(STREAM);

        raf.fire();
        raf.fire();
        expect(driver.version).toBe(0);
        expect(kinds).toEqual([]);

        video.paused = false;
        raf.fire();
        raf.fire();

        expect(driver.version).toBe(2);
        expect(kinds).toEqual(['discrete', 'continuous']);
    });
});

describe('videoTextureDriver: getFrame readiness', () => {
    it('D3: returns null until the element has a decoded frame with positive dimensions, then the element', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo({ readyState: 0, videoWidth: 0, videoHeight: 0 });
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        driver.start(STREAM);
        expect(driver.getFrame()).toBeNull();

        video.readyState = 2;
        expect(driver.getFrame()).toBeNull();

        video.videoWidth = 320;
        video.videoHeight = 240;
        expect(driver.getFrame()).toBe(video);
    });
});

describe('videoTextureDriver: resizeToPOT laziness', () => {
    it('D4: draws the power-of-two copy once per version, reallocates on a dimension change, and passes POT through', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo({ videoWidth: 640, videoHeight: 480 });
        const drawCounts: number[] = [];
        const allocated: { width: number; height: number }[] = [];
        const createPotCanvas = (width: number, height: number): HTMLCanvasElement => {
            const index = allocated.length;
            allocated.push({ width, height });
            drawCounts[index] = 0;
            return {
                width,
                height,
                getContext: (kind: string) =>
                    (kind === '2d' ? { drawImage: () => { drawCounts[index] += 1 } } : null)
            } as unknown as HTMLCanvasElement;
        };
        const driver = createVideoTextureDriver(config({ resizeToPOT: true }), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel,
            createPotCanvas
        });

        driver.start(STREAM);
        rvfc.fire();

        const firstA = driver.getFrame();
        const firstB = driver.getFrame();
        expect(firstA).toBe(firstB);
        expect(allocated[0]).toEqual({ width: 1024, height: 512 });
        expect(drawCounts[0]).toBe(1);

        rvfc.fire();
        driver.getFrame();
        expect(drawCounts[0]).toBe(2);
        expect(allocated).toHaveLength(1);

        video.videoWidth = 100;
        video.videoHeight = 100;
        rvfc.fire();
        const reallocated = driver.getFrame();
        expect(allocated).toHaveLength(2);
        expect(allocated[1]).toEqual({ width: 128, height: 128 });
        expect(reallocated).not.toBe(firstA);

        video.videoWidth = 256;
        video.videoHeight = 256;
        rvfc.fire();
        expect(driver.getFrame()).toBe(video);
        expect(allocated).toHaveLength(2);
    });
});

describe('videoTextureDriver: stop', () => {
    it('D5: cancels the pump and, for an owned element, pauses and detaches it', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        driver.start(STREAM);
        expect(rvfc.pending).toBe(true);

        driver.stop();

        expect(rvfc.cancelled).toHaveLength(1);
        expect(video.pauseCalls).toBe(1);
        expect(video.removedAttributes).toContain('src');
        expect(video.srcObject).toBeNull();
        expect(video.loadCalls).toBe(1);
        expect(driver.status).toBe('idle');
    });

    it('D5: for an adopted element, stops pumping but never pauses it or touches its srcObject', () => {
        const rvfc = makeRvfcScheduler();
        const adopted = makeFakeVideo({ srcObject: { adopted: true } });
        let created = 0;
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => { created += 1; return asVideoElement(makeFakeVideo()) },
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        driver.start(asVideoElement(adopted));
        expect(created).toBe(0);

        driver.stop();

        expect(rvfc.cancelled).toHaveLength(1);
        expect(adopted.pauseCalls).toBe(0);
        expect(adopted.srcObject).toEqual({ adopted: true });
        expect(adopted.loadCalls).toBe(0);
    });
});

describe('videoTextureDriver: the playing predicate', () => {
    it('D6: is true while attached and advancing, and false after stop, pause, or end', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo();
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        expect(driver.playing()).toBe(false);

        driver.start(STREAM);
        expect(driver.playing()).toBe(true);

        video.paused = true;
        expect(driver.playing()).toBe(false);
        video.paused = false;

        video.ended = true;
        expect(driver.playing()).toBe(false);
        video.ended = false;

        driver.stop();
        expect(driver.playing()).toBe(false);
    });
});

describe('videoTextureDriver: the play call', () => {
    it('D7: survives play() returning undefined', () => {
        const rvfc = makeRvfcScheduler();
        const video = makeFakeVideo({ play: () => undefined });
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        expect(() => { driver.start(STREAM) }).not.toThrow();
        rvfc.fire();
        expect(driver.status).toBe('ready');
    });

    it('D7: surfaces a play() rejection while the start is still desired as an error', async () => {
        const rvfc = makeRvfcScheduler();
        const denied = new Error('NotAllowedError');
        const video = makeFakeVideo({ play: () => Promise.reject(denied) });
        const driver = createVideoTextureDriver(config({ onError: error => { activeError = error } }), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        driver.start(STREAM);
        await flushMicrotasks();

        expect(driver.status).toBe('error');
        expect(driver.error).toBe(denied);
        expect(activeError).toBe(denied);
    });

    it('D7: swallows a play() rejection that lands after stop() and does not flip to error', async () => {
        const rvfc = makeRvfcScheduler();
        let reject: (error: unknown) => void = () => undefined;
        const video = makeFakeVideo({ play: () => new Promise<void>((_resolve, rej) => { reject = rej }) });
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => asVideoElement(video),
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });

        driver.start(STREAM);
        driver.stop();
        reject(new Error('AbortError: interrupted by stop'));
        await flushMicrotasks();

        expect(driver.status).toBe('idle');
        expect(driver.error).toBeNull();
    });
});

describe('videoTextureDriver: input change', () => {
    it('D8: stops the previous attachment and paints a fresh discrete first frame for the new input', () => {
        const rvfc = makeRvfcScheduler();
        const first = makeFakeVideo();
        const second = makeFakeVideo();
        const created: FakeVideo[] = [];
        const queue = [first, second];
        const driver = createVideoTextureDriver(config(), {
            createVideo: () => {
                const next = queue.shift();
                if (!next) {
                    throw new Error('unexpected extra createVideo');
                }
                created.push(next);
                return asVideoElement(next);
            },
            requestVideoFrameCallback: rvfc.request,
            cancelVideoFrameCallback: rvfc.cancel
        });
        const kinds: InvalidationKind[] = [];
        driver.invalidation.connect(kind => { kinds.push(kind) });

        driver.start(STREAM);
        rvfc.fire();
        rvfc.fire();
        expect(kinds).toEqual(['discrete', 'continuous']);

        driver.start({ getTracks: () => [] } as unknown as MediaStream);
        expect(first.pauseCalls).toBe(1);
        rvfc.fire();

        expect(created).toEqual([first, second]);
        expect(kinds).toEqual(['discrete', 'continuous', 'discrete']);
    });
});
