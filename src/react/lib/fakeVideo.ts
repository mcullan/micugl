import type { VideoFrameCallbackMetadata } from '@/react/lib/videoTextureDriver';

export interface FakeVideo {
    readyState: number;
    videoWidth: number;
    videoHeight: number;
    paused: boolean;
    ended: boolean;
    muted: boolean;
    playsInline: boolean;
    loop: boolean;
    crossOrigin: string;
    src: string;
    srcObject: unknown;
    error: { code: number } | null;
    playCalls: number;
    pauseCalls: number;
    loadCalls: number;
    removedAttributes: string[];
    setAttributes: [string, string][];
    play: () => Promise<void> | undefined;
    pause: () => void;
    load: () => void;
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
    addEventListener: (type: string, listener: () => void) => void;
    emitError: () => void;
}

export function makeFakeVideo(overrides: Partial<FakeVideo> = {}): FakeVideo {
    const listeners = new Map<string, (() => void)[]>();
    const video: FakeVideo = {
        readyState: 2,
        videoWidth: 640,
        videoHeight: 480,
        paused: false,
        ended: false,
        muted: false,
        playsInline: false,
        loop: false,
        crossOrigin: '',
        src: '',
        srcObject: null,
        error: null,
        playCalls: 0,
        pauseCalls: 0,
        loadCalls: 0,
        removedAttributes: [],
        setAttributes: [],
        play: () => undefined,
        pause: () => undefined,
        load: () => undefined,
        setAttribute: () => undefined,
        removeAttribute: () => undefined,
        addEventListener: () => undefined,
        emitError: () => undefined,
        ...overrides
    };

    const basePlay = video.play;
    video.play = () => { video.playCalls += 1; return basePlay() };
    video.pause = () => { video.pauseCalls += 1; video.paused = true };
    video.load = () => { video.loadCalls += 1 };
    video.setAttribute = (name, value) => { video.setAttributes.push([name, value]) };
    video.removeAttribute = name => { video.removedAttributes.push(name) };
    video.addEventListener = (type, listener) => {
        const bucket = listeners.get(type) ?? [];
        bucket.push(listener);
        listeners.set(type, bucket);
    };
    video.emitError = () => {
        (listeners.get('error') ?? []).forEach(listener => { listener() });
    };

    return video;
}

export function asVideoElement(video: FakeVideo): HTMLVideoElement {
    return video as unknown as HTMLVideoElement;
}

export interface FakeTrack {
    stopped: boolean;
    stop: () => void;
}

export interface FakeStream {
    stream: MediaStream;
    tracks: FakeTrack[];
}

export function makeFakeStream(): FakeStream {
    const tracks: FakeTrack[] = [
        { stopped: false, stop() { this.stopped = true } },
        { stopped: false, stop() { this.stopped = true } }
    ];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    return { stream, tracks };
}

export interface RvfcScheduler {
    request: (video: HTMLVideoElement, callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number;
    cancel: (video: HTMLVideoElement, handle: number) => void;
    fire: (now?: number) => void;
    readonly pending: boolean;
    readonly activeCount: number;
    readonly cancelled: number[];
}

export function makeRvfcScheduler(): RvfcScheduler {
    const active = new Map<number, (now: number, metadata: VideoFrameCallbackMetadata) => void>();
    let handle = 0;
    let latest: number | null = null;
    const cancelled: number[] = [];
    return {
        request: (_video, cb) => {
            handle += 1;
            active.set(handle, cb);
            latest = handle;
            return handle;
        },
        cancel: (_video, h) => {
            if (active.delete(h)) {
                cancelled.push(h);
            }
            if (latest === h) {
                latest = null;
            }
        },
        fire: (now = 0) => {
            if (latest === null) {
                return;
            }
            const current = active.get(latest);
            active.delete(latest);
            latest = null;
            current?.(now, { width: 640, height: 480 });
        },
        get pending() { return latest !== null },
        get activeCount() { return active.size },
        get cancelled() { return cancelled }
    };
}
