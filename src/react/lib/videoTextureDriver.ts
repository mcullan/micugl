import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import type { PotCanvasFactory } from '@/react/lib/potCanvas';
import { defaultPotCanvasFactory, resizeSourceToPot } from '@/react/lib/potCanvas';
import type { TextureStatus, TextureUploadSource } from '@/types';

export type VideoInput = HTMLVideoElement | MediaStream | string;

export interface VideoFrameCallbackMetadata {
    width: number;
    height: number;
}

export interface VideoTextureDriverDeps {
    createVideo?: () => HTMLVideoElement;
    requestVideoFrameCallback?: (
        video: HTMLVideoElement,
        callback: (now: number, metadata: VideoFrameCallbackMetadata) => void
    ) => number;
    cancelVideoFrameCallback?: (video: HTMLVideoElement, handle: number) => void;
    requestAnimationFrame?: (callback: (now: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
    createPotCanvas?: PotCanvasFactory;
}

export interface VideoTextureDriverConfig {
    crossOrigin: string;
    loop: boolean;
    resizeToPOT: boolean;
    onError?: (error: unknown) => void;
}

export interface VideoTextureDriver {
    start(input: VideoInput): void;
    stop(): void;
    getFrame(): TextureUploadSource | null;
    playing(): boolean;
    subscribe: (onChange: () => void) => () => void;
    readonly version: number;
    readonly status: TextureStatus;
    readonly error: unknown;
    readonly video: HTMLVideoElement | null;
    readonly invalidation: FrameInvalidation;
}

const HAVE_CURRENT_DATA = 2;

type Attachment =
    | { kind: 'owned'; video: HTMLVideoElement }
    | { kind: 'adopted'; video: HTMLVideoElement };

type DesiredState = 'running' | 'stopped';

function isMediaStream(input: VideoInput): input is MediaStream {
    if (typeof MediaStream !== 'undefined') {
        return input instanceof MediaStream;
    }
    return typeof input === 'object'
        && typeof (input as { getTracks?: unknown }).getTracks === 'function';
}

function defaultCreateVideo(): HTMLVideoElement {
    if (typeof document === 'undefined') {
        throw new Error(
            'micugl textures: this environment cannot create a <video> element, so a webcam or URL video cannot be '
            + 'pumped. Video textures are browser-only; start() must run in a browser, never during server rendering.'
        );
    }
    return document.createElement('video');
}

function toError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause));
}

export function createVideoTextureDriver(
    config: VideoTextureDriverConfig,
    deps: VideoTextureDriverDeps = {}
): VideoTextureDriver {
    const invalidation = createFrameInvalidation();
    const listeners = new Set<() => void>();
    const createVideo = deps.createVideo ?? defaultCreateVideo;
    const createPotCanvas = deps.createPotCanvas ?? defaultPotCanvasFactory;

    let attachment: Attachment | null = null;
    let desired: DesiredState = 'stopped';
    let status: TextureStatus = 'idle';
    let error: unknown = null;
    let version = 0;
    let firstReadyEmitted = false;

    let rvfcHandle: number | null = null;
    let rafHandle: number | null = null;

    let potCanvas: HTMLCanvasElement | null = null;
    let potCache: TextureUploadSource | null = null;
    let potCacheVersion = -1;

    function notify(): void {
        listeners.forEach(listener => { listener() });
    }

    function setStatus(next: TextureStatus): void {
        status = next;
        notify();
    }

    function currentVideo(): HTMLVideoElement | null {
        return attachment ? attachment.video : null;
    }

    function frameReady(): boolean {
        const video = currentVideo();
        if (video === null) {
            return false;
        }
        return video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
    }

    function reusePotCanvas(width: number, height: number): HTMLCanvasElement {
        if (potCanvas === null || potCanvas.width !== width || potCanvas.height !== height) {
            potCanvas = createPotCanvas(width, height);
        }
        return potCanvas;
    }

    function pumpTick(): void {
        if (desired !== 'running' || !frameReady()) {
            return;
        }
        version += 1;
        const kind = firstReadyEmitted ? 'continuous' : 'discrete';
        firstReadyEmitted = true;
        if (status !== 'ready') {
            error = null;
            setStatus('ready');
        }
        invalidation.request(kind);
    }

    function usesRvfc(video: HTMLVideoElement): boolean {
        if (deps.requestVideoFrameCallback) {
            return true;
        }
        return typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function';
    }

    function scheduleRvfc(video: HTMLVideoElement): void {
        const request = deps.requestVideoFrameCallback
            ?? ((element, callback) => element.requestVideoFrameCallback(callback));
        rvfcHandle = request(video, () => {
            rvfcHandle = null;
            if (desired !== 'running') {
                return;
            }
            pumpTick();
            if (attachment && attachment.video === video) {
                scheduleRvfc(video);
            }
        });
    }

    function scheduleRaf(video: HTMLVideoElement): void {
        const request = deps.requestAnimationFrame
            ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
        if (request === null) {
            throw new Error(
                'micugl textures: no requestAnimationFrame is available to pump this video and the element has no '
                + 'requestVideoFrameCallback. Run in a browser, or inject a scheduler through the driver deps.'
            );
        }
        rafHandle = request(() => {
            rafHandle = null;
            if (desired !== 'running') {
                return;
            }
            if (!video.paused && !video.ended) {
                pumpTick();
            }
            if (attachment && attachment.video === video) {
                scheduleRaf(video);
            }
        });
    }

    function startPump(video: HTMLVideoElement): void {
        if (usesRvfc(video)) {
            scheduleRvfc(video);
        } else {
            scheduleRaf(video);
        }
    }

    function cancelPump(video: HTMLVideoElement): void {
        if (rvfcHandle !== null) {
            const cancel = deps.cancelVideoFrameCallback
                ?? ((element, handle) => { element.cancelVideoFrameCallback(handle) });
            cancel(video, rvfcHandle);
            rvfcHandle = null;
        }
        if (rafHandle !== null) {
            const cancel = deps.cancelAnimationFrame
                ?? (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
            if (cancel !== null) {
                cancel(rafHandle);
            }
            rafHandle = null;
        }
    }

    function raiseError(video: HTMLVideoElement, cause: unknown): void {
        if (desired !== 'running' || attachment === null || attachment.video !== video || status === 'error') {
            return;
        }
        error = toError(cause);
        setStatus('error');
        config.onError?.(cause);
        invalidation.request();
    }

    function attemptPlay(video: HTMLVideoElement): void {
        Promise.resolve(video.play()).catch((cause: unknown) => { raiseError(video, cause) });
    }

    function onOwnedError(video: HTMLVideoElement): void {
        const mediaError = video.error;
        const cause = mediaError
            ? new Error(`micugl textures: the video failed to load (media error code ${String(mediaError.code)}).`)
            : new Error('micugl textures: the video failed to load.');
        raiseError(video, cause);
    }

    function resetFrameState(): void {
        firstReadyEmitted = false;
        potCache = null;
        potCacheVersion = -1;
    }

    function start(input: VideoInput): void {
        stop();
        desired = 'running';
        error = null;
        resetFrameState();

        let video: HTMLVideoElement;
        let kind: Attachment['kind'];

        if (typeof input !== 'string' && !isMediaStream(input)) {
            video = input;
            kind = 'adopted';
            attachment = { kind, video };
            setStatus('loading');
        } else {
            video = createVideo();
            kind = 'owned';
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.loop = config.loop;
            video.addEventListener('error', () => { onOwnedError(video) });
            if (typeof input === 'string') {
                video.crossOrigin = config.crossOrigin;
                video.src = input;
            } else {
                video.srcObject = input;
            }
            attachment = { kind, video };
            setStatus('loading');
            attemptPlay(video);
        }

        startPump(video);
    }

    function stop(): void {
        desired = 'stopped';
        const current = attachment;
        attachment = null;

        if (current === null) {
            return;
        }

        cancelPump(current.video);

        if (current.kind === 'owned') {
            current.video.pause();
            current.video.removeAttribute('src');
            current.video.srcObject = null;
            current.video.load();
        }

        resetFrameState();
        setStatus('idle');
    }

    function getFrame(): TextureUploadSource | null {
        const video = currentVideo();
        if (video === null || !frameReady()) {
            return null;
        }
        if (!config.resizeToPOT) {
            return video;
        }
        if (potCacheVersion === version && potCache !== null) {
            return potCache;
        }
        potCache = resizeSourceToPot(video, reusePotCanvas);
        potCacheVersion = version;
        return potCache;
    }

    function playing(): boolean {
        const video = currentVideo();
        if (video === null) {
            return false;
        }
        return !video.paused && !video.ended && video.readyState >= HAVE_CURRENT_DATA;
    }

    return {
        start,
        stop,
        getFrame,
        playing,
        subscribe: onChange => {
            listeners.add(onChange);
            return () => { listeners.delete(onChange) };
        },
        get version() { return version },
        get status() { return status },
        get error() { return error },
        get video() { return currentVideo() },
        invalidation
    };
}
