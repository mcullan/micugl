import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { BandCount, ResolvedAnalyserOptions } from '@/core/lib/audioBands';
import { validateAudioOptions } from '@/core/lib/audioBands';
import type { AudioAnalyserDriver, AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import { createAudioAnalyserDriver } from '@/react/lib/audioAnalyserDriver';
import type {
    AudioSourceSpec,
    AudioStatus,
    AudioUniformsOptions,
    UniformParam,
    UniformType,
    UniformTypeMap
} from '@/types';

export interface AudioUniformsResult {
    uniforms: Record<string, UniformParam>;
    start: () => Promise<void>;
    stop: () => void;
    status: AudioStatus;
    error: Error | null;
}

const BAND_UNIFORM_TYPES = {
    1: 'float',
    2: 'vec2',
    3: 'vec3',
    4: 'vec4'
} as const satisfies Record<BandCount, UniformType>;

const getServerStatus = (): AudioStatus => 'idle';

const getServerError = (): Error | null => null;

function analyserOptionsKey(options: ResolvedAnalyserOptions): string {
    return [
        options.bands,
        options.fftSize,
        options.smoothingTimeConstant,
        options.attack,
        options.release,
        options.minDecibels,
        options.maxDecibels,
        options.bandLayout
    ].join('|');
}

function sourceIdentity(source: AudioSourceSpec): unknown[] {
    if (source.type === 'element') {
        return ['element', source.element];
    }
    if (source.type === 'node') {
        return ['node', source.node, source.context];
    }
    return ['mic'];
}

function assertSameSource(previous: AudioSourceSpec, next: AudioSourceSpec): void {
    const before = sourceIdentity(previous);
    const after = sourceIdentity(next);
    const same = before.length === after.length && before.every((part, index) => part === after[index]);
    if (same) {
        return;
    }

    throw new Error(
        `micugl audio: useAudioUniforms was given a "${previous.type}" source and is now being given a `
        + `"${next.type}" source, but a hook instance owns one audio graph for its whole life: the microphone `
        + 'track, the AudioContext and the analyser were all built for the first source, and rebinding them '
        + 'under a live shader would leave the old source running with nobody stopping it. Give the component '
        + 'a "key" that changes with the source, so React unmounts the old hook (stopping it) and mounts a new one.'
    );
}

export const useAudioUniforms = (
    source: AudioSourceSpec,
    options?: AudioUniformsOptions,
    deps?: AudioAnalyserDriverDeps
): AudioUniformsResult => {
    const resolved = validateAudioOptions(options);
    const optionsKey = analyserOptionsKey(resolved);

    const sourceRef = useRef(source);
    assertSameSource(sourceRef.current, source);

    const driverRef = useRef<AudioAnalyserDriver | null>(null);
    driverRef.current ??= createAudioAnalyserDriver(source, resolved, deps);
    const driver = driverRef.current;

    const appliedKeyRef = useRef(optionsKey);

    useEffect(() => {
        if (appliedKeyRef.current === optionsKey) {
            return;
        }
        driver.reconfigure(resolved);
        appliedKeyRef.current = optionsKey;
    });

    useEffect(() => () => { driver.stop() }, [driver]);

    const status = useSyncExternalStore(driver.subscribe, () => driver.status, getServerStatus);
    const error = useSyncExternalStore(driver.subscribe, () => driver.error, getServerError);

    const start = useCallback(() => driver.start(), [driver]);
    const stop = useCallback(() => { driver.stop() }, [driver]);

    const bands = resolved.bands;
    const bandsName = resolved.names.bands;
    const levelName = resolved.names.level;

    const nonReproducible = useCallback(() => driver.status === 'running', [driver]);

    const uniforms = useMemo<Record<string, UniformParam>>(() => ({
        [bandsName]: {
            type: BAND_UNIFORM_TYPES[bands],
            value: time => {
                driver.analyseIfNeeded(time ?? 0);
                const scratch = driver.bandsScratch;
                return (bands === 1 ? scratch[0] : scratch) as UniformTypeMap[UniformType];
            },
            invalidation: driver.invalidation,
            nonReproducible
        },
        [levelName]: {
            type: 'float',
            value: time => {
                driver.analyseIfNeeded(time ?? 0);
                return driver.level;
            },
            invalidation: driver.invalidation,
            nonReproducible
        }
    }), [driver, bands, bandsName, levelName, nonReproducible]);

    return { uniforms, start, stop, status, error };
};
