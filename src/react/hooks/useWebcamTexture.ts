import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type { VideoTextureDriver, VideoTextureDriverConfig, VideoTextureDriverDeps } from '@/react/lib/videoTextureDriver';
import { createVideoTextureDriver } from '@/react/lib/videoTextureDriver';
import type { WebcamAcquisition, WebcamConstraintOptions } from '@/react/lib/webcamAcquisition';
import { buildWebcamConstraints, createWebcamAcquisition } from '@/react/lib/webcamAcquisition';
import type { SourceTextureOptions, TextureSource } from '@/types';

export type WebcamStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export interface WebcamTextureDeps extends VideoTextureDriverDeps {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface WebcamTextureOptions extends SourceTextureOptions {
    deviceId?: string;
    facingMode?: 'user' | 'environment';
    width?: number;
    height?: number;
    resizeToPOT?: boolean;
    onError?: (error: unknown) => void;
    deps?: WebcamTextureDeps;
}

export interface WebcamTextureResult {
    texture: TextureSource;
    status: WebcamStatus;
    error: Error | null;
    start: () => Promise<void>;
    stop: () => void;
    stream: MediaStream | null;
}

let webcamTextureCounter = 0;

const getServerStatus = (): WebcamStatus => 'idle';
const getServerError = (): Error | null => null;
const getServerStream = (): MediaStream | null => null;

function constraintOptions(options?: WebcamTextureOptions): WebcamConstraintOptions {
    return {
        deviceId: options?.deviceId,
        facingMode: options?.facingMode,
        width: options?.width,
        height: options?.height
    };
}

function constraintKey(options: WebcamConstraintOptions): string {
    return JSON.stringify([options.deviceId, options.facingMode, options.width, options.height]);
}

function assertSameConstraints(previous: string, next: string): void {
    if (previous === next) {
        return;
    }
    throw new Error(
        'micugl textures: useWebcamTexture was given different camera constraints (deviceId, facingMode, width or '
        + 'height) after it first mounted, but a hook instance owns one camera acquisition for its whole life: the '
        + 'MediaStream tracks were opened for the first constraints, and rebinding them under a live shader would '
        + 'leave the old camera running with nobody stopping it. Give the component a "key" that changes with the '
        + 'constraints, so React unmounts the old hook (stopping the camera) and mounts a new one.'
    );
}

export function useWebcamTexture(options?: WebcamTextureOptions): WebcamTextureResult {
    const resolved = resolveSourceTextureOptions(options);
    const resizeToPOT = options?.resizeToPOT ?? false;
    const optionsKey = `${JSON.stringify(resolved)}|${String(resizeToPOT)}`;

    const constraints = constraintOptions(options);
    const key = constraintKey(constraints);
    const constraintKeyRef = useRef(key);
    assertSameConstraints(constraintKeyRef.current, key);

    const idRef = useRef('');
    if (idRef.current === '') {
        webcamTextureCounter += 1;
        idRef.current = `webcam-texture-${String(webcamTextureCounter)}`;
    }

    const onErrorRef = useRef(options?.onError);
    onErrorRef.current = options?.onError;

    const acquisitionRef = useRef<WebcamAcquisition | null>(null);

    const configRef = useRef<VideoTextureDriverConfig>({
        crossOrigin: 'anonymous',
        loop: false,
        resizeToPOT,
        onError: cause => { acquisitionRef.current?.fail(cause) }
    });
    configRef.current.resizeToPOT = resizeToPOT;

    const driverRef = useRef<VideoTextureDriver | null>(null);
    driverRef.current ??= createVideoTextureDriver(configRef.current, options?.deps);
    const driver = driverRef.current;

    acquisitionRef.current ??= createWebcamAcquisition(buildWebcamConstraints(constraints), {
        getUserMedia: options?.deps?.getUserMedia,
        attach: stream => { driver.start(stream) },
        detach: () => { driver.stop() },
        onError: cause => { onErrorRef.current?.(cause) }
    });
    const acquisition = acquisitionRef.current;

    const nonReproducible = useCallback(() => acquisition.status === 'running', [acquisition]);

    const sourceRef = useRef<TextureSource | null>(null);
    const mintedOptionsKeyRef = useRef('');
    if (sourceRef.current === null || mintedOptionsKeyRef.current !== optionsKey) {
        mintedOptionsKeyRef.current = optionsKey;
        sourceRef.current = {
            id: idRef.current,
            get version() { return driver.version },
            options: resolved,
            getFrame: () => driver.getFrame(),
            invalidation: driver.invalidation,
            nonReproducible
        };
    }
    const source = sourceRef.current;

    useEffect(() => () => { acquisition.stop() }, [acquisition]);

    const status = useSyncExternalStore(acquisition.subscribe, () => acquisition.status, getServerStatus);
    const error = useSyncExternalStore(acquisition.subscribe, () => acquisition.error, getServerError);
    const stream = useSyncExternalStore(acquisition.subscribe, () => acquisition.stream, getServerStream);

    const start = useCallback(() => acquisition.start(), [acquisition]);
    const stop = useCallback(() => { acquisition.stop() }, [acquisition]);

    if (status === 'error' && options?.onError === undefined) {
        throw error ?? new Error('micugl textures: the webcam failed to start.');
    }

    return { texture: source, status, error, start, stop, stream };
}
