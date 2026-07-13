import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { CapturesAreNonReproducible, NonReproducible } from '@/react/lib/captureLiveness';
import {
    buildLiveUpdaters,
    collectInvalidations,
    collectLiveValues,
    collectNonReproducible,
    collectPosterValues,
    createUniformDebugPort,
    type LiveValues,
    mergeOverrides,
    parseUniformStructureKey,
    type PosterSnapshot,
    posterValuesChanged,
    type UniformDebugPort,
    type UniformDescriptor,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import { createTransitionRuntime, type TransitionRuntime } from '@/react/lib/transitionRuntime';
import type { MotionPolicy, UniformParam, UniformUpdaterDef } from '@/types';

export interface UniformUpdatersResult {
    updaters: Record<string, UniformUpdaterDef[]>;
    port: UniformDebugPort;
    invalidation: FrameInvalidation;
    capturesAreNonReproducible: CapturesAreNonReproducible;
}

export interface UniformUpdatersOptions {
    skipDefaultUniforms?: boolean;
    reducedMotion?: MotionPolicy;
    saveData?: MotionPolicy;
}

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>,
    options?: UniformUpdatersOptions
): UniformUpdatersResult => {
    const skipDefaults = options?.skipDefaultUniforms ?? false;
    const motionGate = useMotionGate(options?.reducedMotion, options?.saveData);

    const descriptors = uniformDescriptors(uniforms);
    const structureKey = uniformStructureKey(descriptors, skipDefaults);

    const baseValuesRef = useRef<LiveValues>({});
    const overridesRef = useRef<LiveValues>({});
    const valuesRef = useRef<LiveValues>({});
    const descriptorsRef = useRef<UniformDescriptor[]>(descriptors);
    descriptorsRef.current = descriptors;

    const nonReproducibleRef = useRef<NonReproducible[]>([]);
    nonReproducibleRef.current = collectNonReproducible(uniforms);

    const runtimeRef = useRef<TransitionRuntime | null>(null);
    runtimeRef.current ??= createTransitionRuntime(
        name => Object.prototype.hasOwnProperty.call(overridesRef.current, name)
    );
    const runtime = runtimeRef.current;

    const relayedRef = useRef(new Map<FrameInvalidation, () => void>());
    const posterRef = useRef<PosterSnapshot | null>(null);

    useEffect(() => {
        const base = collectLiveValues(uniforms);
        const nextPoster = collectPosterValues(uniforms);
        const previousPoster = posterRef.current;
        posterRef.current = nextPoster;

        baseValuesRef.current = base;
        valuesRef.current = mergeOverrides(base, overridesRef.current);
        runtime.applyTargets(uniforms, motionGate);

        if (
            motionGate !== 'none'
            && previousPoster !== null
            && posterValuesChanged(previousPoster, nextPoster)
        ) {
            runtime.invalidation.request();
        }

        const relayed = relayedRef.current;
        const sources = collectInvalidations(uniforms);

        for (const source of sources) {
            if (!relayed.has(source)) {
                relayed.set(source, source.connect(kind => { runtime.invalidation.request(kind) }));
            }
        }
        for (const [source, dispose] of relayed) {
            if (!sources.includes(source)) {
                dispose();
                relayed.delete(source);
            }
        }
    });

    useEffect(() => {
        const relayed = relayedRef.current;
        return () => {
            relayed.forEach(dispose => { dispose() });
            relayed.clear();
        };
    }, []);

    const port = useMemo(
        () => createUniformDebugPort({
            descriptorsRef,
            baseValuesRef,
            overridesRef,
            valuesRef,
            onChange: () => { runtime.invalidation.request() }
        }),
        [runtime]
    );

    const updaters = useMemo(() => {
        const parsed = parseUniformStructureKey(structureKey);
        return {
            [programId]: buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef, runtime)
        };
    }, [programId, structureKey, runtime]);

    const capturesAreNonReproducible = useCallback<CapturesAreNonReproducible>(() => {
        if (runtime.springsInFlight()) {
            return 'spring';
        }
        for (const isLive of nonReproducibleRef.current) {
            if (isLive()) {
                return 'audio';
            }
        }
        return null;
    }, [runtime]);

    return {
        updaters,
        port,
        invalidation: runtime.invalidation,
        capturesAreNonReproducible
    };
};
