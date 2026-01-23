import { useRef } from 'react';

import { createCommonUpdaters, createUniformUpdater } from '@/react/lib/createUniformUpdater';
import type { UniformParam, UniformUpdaterDef } from '@/types';

function serializeUniforms(uniforms: Record<string, UniformParam>): string {
    const keys = Object.keys(uniforms).sort();
    return keys.map(k => {
        const p = uniforms[k];
        const valStr = typeof p.value === 'function' ? p.value.toString() : JSON.stringify(p.value);
        return `${k}:${p.type}:${valStr}`;
    }).join('|');
}

export const useUniformUpdaters = (
    programId: string,
    uniforms: Record<string, UniformParam>,
    options?: { skipDefaultUniforms?: boolean }
) => {
    const cacheRef = useRef<{
        key: string;
        result: Record<string, UniformUpdaterDef[]>;
    } | null>(null);

    const skip = options?.skipDefaultUniforms ?? false;
    const cacheKey = `${programId}|${skip}|${serializeUniforms(uniforms)}`;

    if (cacheRef.current && cacheRef.current.key === cacheKey) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (window as any).__micuglMetrics.hookCacheHits++;
        }
        return cacheRef.current.result;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (window as any).__micuglMetrics.hookCacheMisses++;
    }

    const updaters: UniformUpdaterDef[] = skip ? [] : createCommonUpdaters().filter(u =>
        (u.name === 'u_time' && !('u_time' in uniforms)) 
        || (u.name === 'u_resolution' && !('u_resolution' in uniforms))
    );

    Object.entries(uniforms).forEach(([name, param]) => {
        const uniformName = name.startsWith('u_') ? name : `u_${name}`;
        updaters.push(createUniformUpdater(uniformName, param.type, param.value));
    });

    const result = { [programId]: updaters };
    cacheRef.current = { key: cacheKey, result };
    return result;
};
