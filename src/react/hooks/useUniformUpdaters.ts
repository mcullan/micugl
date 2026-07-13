import { useEffect, useMemo, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import {
    buildLiveUpdaters,
    collectLiveValues,
    createUniformDebugPort,
    type LiveValues,
    mergeOverrides,
    parseUniformStructureKey,
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

    const runtimeRef = useRef<TransitionRuntime | null>(null);
    runtimeRef.current ??= createTransitionRuntime(
        name => Object.prototype.hasOwnProperty.call(overridesRef.current, name)
    );
    const runtime = runtimeRef.current;

    useEffect(() => {
        const base = collectLiveValues(uniforms);
        baseValuesRef.current = base;
        valuesRef.current = mergeOverrides(base, overridesRef.current);
        runtime.applyTargets(uniforms, motionGate);
    });

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

    return { updaters, port, invalidation: runtime.invalidation };
};
