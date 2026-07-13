import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type {
    VideoInput,
    VideoTextureDriver,
    VideoTextureDriverConfig,
    VideoTextureDriverDeps
} from '@/react/lib/videoTextureDriver';
import { createVideoTextureDriver } from '@/react/lib/videoTextureDriver';
import type { SourceTextureOptions, TextureSource, TextureStatus } from '@/types';

export type { VideoInput } from '@/react/lib/videoTextureDriver';

export type VideoTextureDeps = VideoTextureDriverDeps;

export interface VideoTextureOptions extends SourceTextureOptions {
    resizeToPOT?: boolean;
    crossOrigin?: string;
    loop?: boolean;
    onError?: (error: unknown) => void;
    deps?: VideoTextureDeps;
}

export interface VideoTextureResult {
    texture: TextureSource;
    status: TextureStatus;
    error: unknown;
    video: HTMLVideoElement | null;
}

let videoTextureCounter = 0;

const getServerStatus = (): TextureStatus => 'idle';
const getServerError = (): unknown => null;
const getServerVideo = (): HTMLVideoElement | null => null;

export function useVideoTexture(input: VideoInput | null, options?: VideoTextureOptions): VideoTextureResult {
    const resolved = resolveSourceTextureOptions(options);
    const resizeToPOT = options?.resizeToPOT ?? false;
    const optionsKey = `${JSON.stringify(resolved)}|${String(resizeToPOT)}`;

    const idRef = useRef('');
    if (idRef.current === '') {
        videoTextureCounter += 1;
        idRef.current = `video-texture-${String(videoTextureCounter)}`;
    }

    const configRef = useRef<VideoTextureDriverConfig>({
        crossOrigin: options?.crossOrigin ?? 'anonymous',
        loop: options?.loop ?? false,
        resizeToPOT,
        onError: options?.onError
    });
    configRef.current.crossOrigin = options?.crossOrigin ?? 'anonymous';
    configRef.current.loop = options?.loop ?? false;
    configRef.current.resizeToPOT = resizeToPOT;
    configRef.current.onError = options?.onError;

    const driverRef = useRef<VideoTextureDriver | null>(null);
    driverRef.current ??= createVideoTextureDriver(configRef.current, options?.deps);
    const driver = driverRef.current;

    const nonReproducible = useCallback(() => driver.playing(), [driver]);

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

    useEffect(() => {
        if (input === null) {
            driver.stop();
            return;
        }
        driver.start(input);
        return () => { driver.stop() };
    }, [driver, input, optionsKey]);

    const status = useSyncExternalStore(driver.subscribe, () => driver.status, getServerStatus);
    const error = useSyncExternalStore(driver.subscribe, () => driver.error, getServerError);
    const video = useSyncExternalStore(driver.subscribe, () => driver.video, getServerVideo);

    if (status === 'error' && options?.onError === undefined) {
        throw error;
    }

    return { texture: source, status, error, video };
}
