import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
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
    type PosterSnapshot,
    posterValuesChanged,
    type UniformDebugPort,
    type UniformDescriptor,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import type { MotionGate } from '@/react/lib/motionPolicy';
import { createTransitionRuntime } from '@/react/lib/transitionRuntime';
import type { UniformParam, UniformUpdaterDef } from '@/types';

export interface UniformRuntime {
    sync: (uniforms: Record<string, UniformParam>, skipDefaultUniforms: boolean) => UniformUpdaterDef[];
    commit: (uniforms: Record<string, UniformParam>, motionGate: MotionGate) => void;
    dispose: () => void;
    port: UniformDebugPort;
    invalidation: FrameInvalidation;
    capturesAreNonReproducible: CapturesAreNonReproducible;
}

export function createUniformRuntime(): UniformRuntime {
    const baseValuesRef: { current: LiveValues } = { current: {} };
    const overridesRef: { current: LiveValues } = { current: {} };
    const valuesRef: { current: LiveValues } = { current: {} };
    const descriptorsRef: { current: UniformDescriptor[] } = { current: [] };
    const nonReproducibleRef: { current: NonReproducible[] } = { current: [] };

    const transitions = createTransitionRuntime(
        name => Object.prototype.hasOwnProperty.call(overridesRef.current, name)
    );

    const relayed = new Map<FrameInvalidation, () => void>();

    let poster: PosterSnapshot | null = null;
    let structureKey: string | null = null;
    let updaters: UniformUpdaterDef[] = [];

    const port = createUniformDebugPort({
        descriptorsRef,
        baseValuesRef,
        overridesRef,
        valuesRef,
        onChange: () => { transitions.invalidation.request() }
    });

    const capturesAreNonReproducible: CapturesAreNonReproducible = () => {
        if (transitions.springsInFlight()) {
            return 'spring';
        }
        for (const isLive of nonReproducibleRef.current) {
            if (isLive()) {
                return 'audio';
            }
        }
        return null;
    };

    return {
        sync: (uniforms, skipDefaultUniforms) => {
            const descriptors = uniformDescriptors(uniforms);
            descriptorsRef.current = descriptors;
            nonReproducibleRef.current = collectNonReproducible(uniforms);

            const nextKey = uniformStructureKey(descriptors, skipDefaultUniforms);
            if (nextKey !== structureKey) {
                structureKey = nextKey;
                updaters = buildLiveUpdaters(descriptors, skipDefaultUniforms, valuesRef, transitions);
            }

            return updaters;
        },
        commit: (uniforms, motionGate) => {
            const base = collectLiveValues(uniforms);
            const nextPoster = collectPosterValues(uniforms);
            const previousPoster = poster;
            poster = nextPoster;

            baseValuesRef.current = base;
            valuesRef.current = mergeOverrides(base, overridesRef.current);
            transitions.applyTargets(uniforms, motionGate);

            if (
                motionGate !== 'none'
                && previousPoster !== null
                && posterValuesChanged(previousPoster, nextPoster)
            ) {
                transitions.invalidation.request();
            }

            const sources = collectInvalidations(uniforms);

            for (const source of sources) {
                if (!relayed.has(source)) {
                    relayed.set(source, source.connect(kind => { transitions.invalidation.request(kind) }));
                }
            }
            for (const [source, dispose] of relayed) {
                if (!sources.includes(source)) {
                    dispose();
                    relayed.delete(source);
                }
            }
        },
        dispose: () => {
            relayed.forEach(dispose => { dispose() });
            relayed.clear();
        },
        port,
        invalidation: transitions.invalidation,
        capturesAreNonReproducible
    };
}
