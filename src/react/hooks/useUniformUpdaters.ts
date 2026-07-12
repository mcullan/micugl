import { useEffect, useMemo, useRef } from 'react';

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
import type { UniformParam, UniformUpdaterDef } from '@/types';

export interface UniformUpdatersResult {
    updaters: Record<string, UniformUpdaterDef[]>;
    port: UniformDebugPort;
}

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>,
    options?: { skipDefaultUniforms?: boolean }
): UniformUpdatersResult => {
    const skipDefaults = options?.skipDefaultUniforms ?? false;
    const descriptors = uniformDescriptors(uniforms);
    const structureKey = uniformStructureKey(descriptors, skipDefaults);

    const baseValuesRef = useRef<LiveValues>({});
    const overridesRef = useRef<LiveValues>({});
    const valuesRef = useRef<LiveValues>({});
    const descriptorsRef = useRef<UniformDescriptor[]>(descriptors);
    descriptorsRef.current = descriptors;

    useEffect(() => {
        const base = collectLiveValues(uniforms);
        baseValuesRef.current = base;
        valuesRef.current = mergeOverrides(base, overridesRef.current);
    });

    const port = useMemo(
        () => createUniformDebugPort({ descriptorsRef, baseValuesRef, overridesRef, valuesRef }),
        []
    );

    const updaters = useMemo(() => {
        const parsed = parseUniformStructureKey(structureKey);
        return { [programId]: buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef) };
    }, [programId, structureKey]);

    return { updaters, port };
};
