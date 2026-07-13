export interface WebcamConstraintOptions {
    deviceId?: string;
    facingMode?: 'user' | 'environment';
    width?: number;
    height?: number;
}

export interface WebcamAcquisitionDeps {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    attach: (stream: MediaStream) => void;
    detach: () => void;
    onError?: (error: unknown) => void;
}

export type WebcamAcquisitionStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export interface WebcamAcquisition {
    start: () => Promise<void>;
    stop: () => void;
    fail: (cause: unknown) => void;
    subscribe: (onChange: () => void) => () => void;
    readonly status: WebcamAcquisitionStatus;
    readonly error: Error | null;
    readonly stream: MediaStream | null;
}

type AcquisitionState =
    | { kind: 'idle' }
    | { kind: 'starting'; pending: Promise<void> }
    | { kind: 'running'; stream: MediaStream }
    | { kind: 'stopped' }
    | { kind: 'error'; error: Error };

type DesiredState = 'running' | 'stopped';

export function buildWebcamConstraints(options: WebcamConstraintOptions = {}): MediaStreamConstraints {
    const video: MediaTrackConstraints = {};

    if (options.deviceId !== undefined) {
        video.deviceId = options.deviceId;
    }
    if (options.facingMode !== undefined) {
        video.facingMode = options.facingMode;
    }
    if (options.width !== undefined) {
        video.width = options.width;
    }
    if (options.height !== undefined) {
        video.height = options.height;
    }

    return {
        video: Object.keys(video).length === 0 ? true : video,
        audio: false
    };
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (typeof navigator !== 'object' || typeof navigator.mediaDevices !== 'object') {
        throw new Error(
            'micugl textures: navigator.mediaDevices.getUserMedia is unavailable, so the webcam cannot be opened. '
            + 'getUserMedia only exists in a secure context: serve the page over https, or from localhost.'
        );
    }
    return navigator.mediaDevices.getUserMedia(constraints);
}

function toError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause));
}

function keepRejectionHandled(promise: Promise<void>): void {
    void promise.catch(() => undefined);
}

function stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
        track.stop();
    }
}

export function createWebcamAcquisition(
    constraints: MediaStreamConstraints,
    deps: WebcamAcquisitionDeps
): WebcamAcquisition {
    const listeners = new Set<() => void>();
    const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;

    let state: AcquisitionState = { kind: 'idle' };
    let desired: DesiredState = 'stopped';

    function notify(): void {
        listeners.forEach(listener => { listener() });
    }

    function setState(next: AcquisitionState): void {
        state = next;
        notify();
    }

    function readStatus(): WebcamAcquisitionStatus {
        if (state.kind === 'starting' && desired === 'stopped') {
            return 'stopped';
        }
        return state.kind;
    }

    async function beginStart(): Promise<void> {
        let stream: MediaStream | null = null;
        let attached = false;
        let failure: Error | null = null;

        try {
            stream = await getUserMedia(constraints);
            if (desired === 'running') {
                deps.attach(stream);
                attached = true;
            }
        } catch (cause) {
            failure = toError(cause);
        }

        if (!attached && stream !== null) {
            stopTracks(stream);
        }

        if (failure !== null) {
            if (desired === 'running') {
                desired = 'stopped';
                setState({ kind: 'error', error: failure });
                deps.onError?.(failure);
            } else {
                setState({ kind: 'stopped' });
            }
            throw failure;
        }

        if (!attached || stream === null) {
            setState({ kind: 'stopped' });
            return;
        }

        setState({ kind: 'running', stream });
    }

    function start(): Promise<void> {
        const wasStopping = desired === 'stopped';
        desired = 'running';

        if (state.kind === 'running') {
            return Promise.resolve();
        }
        if (state.kind === 'starting') {
            if (wasStopping) {
                notify();
            }
            return state.pending;
        }

        const run = beginStart();
        keepRejectionHandled(run);
        setState({ kind: 'starting', pending: run });

        return run;
    }

    function stop(): void {
        const wasStarting = desired === 'running';
        desired = 'stopped';

        if (state.kind === 'starting') {
            if (wasStarting) {
                notify();
            }
            return;
        }

        if (state.kind !== 'running') {
            return;
        }

        deps.detach();
        stopTracks(state.stream);
        setState({ kind: 'stopped' });
    }

    function fail(cause: unknown): void {
        if (state.kind === 'error') {
            return;
        }
        const failure = toError(cause);
        desired = 'stopped';
        if (state.kind === 'running') {
            deps.detach();
            stopTracks(state.stream);
        }
        setState({ kind: 'error', error: failure });
        deps.onError?.(failure);
    }

    return {
        start,
        stop,
        fail,
        subscribe: onChange => {
            listeners.add(onChange);
            return () => { listeners.delete(onChange) };
        },
        get status() { return readStatus() },
        get error() { return state.kind === 'error' ? state.error : null },
        get stream() { return state.kind === 'running' ? state.stream : null }
    };
}
