import { useMemo } from 'react';

import {  createCommonUpdaters, createUniformUpdater } from '@/react/lib/createUniformUpdater';
import type { UniformParam, UniformType, UniformUpdaterDef } from '@/types';

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>
) => {
    return useMemo(() => {
        const updaters: UniformUpdaterDef<UniformType>[] = createCommonUpdaters();

        Object.entries(uniforms).forEach(([name, param]) => {
            const uniformName = name.startsWith('u_') ? name : `u_${name}`;
            updaters.push(createUniformUpdater(uniformName, param.type, param.value));
        });

        return { [programId]: updaters };
    }, [programId, uniforms]);
};
