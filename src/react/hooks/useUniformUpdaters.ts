import { useEffect, useMemo, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { CapturesAreNonReproducible } from '@/react/lib/captureLiveness';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import type { UniformRuntime } from '@/react/lib/uniformRuntime';
import { createUniformRuntime } from '@/react/lib/uniformRuntime';
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

    const runtimeRef = useRef<UniformRuntime | null>(null);
    runtimeRef.current ??= createUniformRuntime();
    const runtime = runtimeRef.current;

    const defs = runtime.sync(uniforms, skipDefaults);

    useEffect(() => {
        runtime.commit(uniforms, motionGate);
    });

    useEffect(() => {
        return () => { runtime.dispose() };
    }, [runtime]);

    const updaters = useMemo(() => ({ [programId]: defs }), [programId, defs]);

    return {
        updaters,
        port: runtime.port,
        invalidation: runtime.invalidation,
        capturesAreNonReproducible: runtime.capturesAreNonReproducible
    };
};
