import { useEffect, useMemo, useRef } from 'react';

import {
    buildLiveUpdaters,
    collectLiveValues,
    type LiveValues,
    parseUniformStructureKey,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import type { UniformParam, UniformUpdaterDef } from '@/types';

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>,
    options?: { skipDefaultUniforms?: boolean }
): Record<string, UniformUpdaterDef[]> => {
    const skipDefaults = options?.skipDefaultUniforms ?? false;
    const structureKey = uniformStructureKey(uniformDescriptors(uniforms), skipDefaults);

    const valuesRef = useRef<LiveValues>({});
    useEffect(() => {
        valuesRef.current = collectLiveValues(uniforms);
    });

    return useMemo(() => {
        const parsed = parseUniformStructureKey(structureKey);
        return { [programId]: buildLiveUpdaters(parsed.descriptors, parsed.skipDefaults, valuesRef) };
    }, [programId, structureKey]);
};
