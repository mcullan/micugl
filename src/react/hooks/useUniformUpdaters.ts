import { useMemo } from 'react';

import { createCommonUpdaters, createUniformUpdater } from '@/react/lib/createUniformUpdater';
import type {  UniformParam, UniformUpdaterDef } from '@/types';

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>,
    options?: { skipDefaultUniforms?: boolean }
) => {
    return useMemo(() => {
        
        const skip = options?.skipDefaultUniforms ?? false;
        const updaters: UniformUpdaterDef[] = skip ? [] : createCommonUpdaters().filter(u =>
            (u.name === 'u_time' && !('u_time' in uniforms)) 
            ||(u.name === 'u_resolution' && !('u_resolution' in uniforms))
        );

        Object.entries(uniforms).forEach(([name, param]) => {
            const uniformName = name.startsWith('u_') ? name : `u_${name}`;
            updaters.push(createUniformUpdater(uniformName, param.type, param.value));
        });

        return { [programId]: updaters };
    }, [programId, uniforms, options?.skipDefaultUniforms]);
};
