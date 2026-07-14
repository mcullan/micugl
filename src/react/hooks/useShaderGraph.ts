import { useEffect, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { combineFrameInvalidation } from '@/core/lib/frameInvalidation';
import type { GraphPlan, ShaderNode } from '@/core/lib/graphPlanning';
import { planGraph, toRenderPasses } from '@/core/lib/graphPlanning';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { CapturesAreNonReproducible } from '@/react/lib/captureLiveness';
import { graphStructureKey } from '@/react/lib/graphKeys';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import { combineUniformDebugPorts } from '@/react/lib/liveUniformUpdaters';
import { passUniformsFrom } from '@/react/lib/pingPongPasses';
import type { UniformRuntime } from '@/react/lib/uniformRuntime';
import { createUniformRuntime } from '@/react/lib/uniformRuntime';
import type {
    FramebufferOptions,
    MotionPolicy,
    RenderPass,
    ShaderProgramConfig,
    TextureSource,
    UniformUpdaterDef
} from '@/types';

export interface ShaderGraphOptions {
    reducedMotion?: MotionPolicy;
    saveData?: MotionPolicy;
}

export interface ShaderGraphResult {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers: Record<string, FramebufferOptions>;
    textureSources: TextureSource[];
    port: UniformDebugPort;
    invalidation: FrameInvalidation;
    capturesAreNonReproducible: CapturesAreNonReproducible;
}

interface GraphMemo {
    key: string;
    runtimes: UniformRuntime[];
    result: ShaderGraphResult;
}

function sameRuntimes(a: UniformRuntime[], b: UniformRuntime[]): boolean {
    return a.length === b.length && a.every((runtime, index) => runtime === b[index]);
}

function buildResult(
    plan: GraphPlan,
    runtimes: UniformRuntime[],
    updaters: Record<string, UniformUpdaterDef[]>
): ShaderGraphResult {
    const capturesAreNonReproducible: CapturesAreNonReproducible = () => {
        for (const runtime of runtimes) {
            const blocker = runtime.capturesAreNonReproducible();
            if (blocker !== null) {
                return blocker;
            }
        }
        for (const source of plan.sources) {
            if (source.nonReproducible?.() === true) {
                return 'texture';
            }
        }
        return null;
    };

    return {
        programConfigs: plan.programConfigs,
        passes: toRenderPasses(plan, nodeId => passUniformsFrom(updaters[nodeId])),
        framebuffers: plan.framebuffers,
        textureSources: plan.sources,
        port: combineUniformDebugPorts(runtimes.map(runtime => runtime.port)),
        invalidation: combineFrameInvalidation([
            ...runtimes.map(runtime => runtime.invalidation),
            ...plan.sources.map(source => source.invalidation)
        ]),
        capturesAreNonReproducible
    };
}

export const useShaderGraph = (root: ShaderNode, options?: ShaderGraphOptions): ShaderGraphResult => {
    const motionGate = useMotionGate(options?.reducedMotion, options?.saveData);

    const plan = planGraph(root);
    const structureKey = graphStructureKey(plan);

    const runtimesRef = useRef(new Map<string, UniformRuntime>());
    const runtimes = runtimesRef.current;

    const ordered: UniformRuntime[] = [];
    const updatersByNode: Record<string, UniformUpdaterDef[]> = {};

    for (const pass of plan.passes) {
        let runtime = runtimes.get(pass.nodeId);
        if (!runtime) {
            runtime = createUniformRuntime();
            runtimes.set(pass.nodeId, runtime);
        }
        ordered.push(runtime);
        updatersByNode[pass.nodeId] = runtime.sync(pass.valueUniforms, false);
    }

    const memoRef = useRef<GraphMemo | null>(null);
    const cached = memoRef.current;
    const memo: GraphMemo = cached !== null
        && cached.key === structureKey
        && sameRuntimes(cached.runtimes, ordered)
        ? cached
        : {
            key: structureKey,
            runtimes: ordered,
            result: buildResult(plan, ordered, updatersByNode)
        };
    memoRef.current = memo;

    useEffect(() => {
        const present = new Set<string>();

        for (const pass of plan.passes) {
            const runtime = runtimes.get(pass.nodeId);
            if (runtime) {
                present.add(pass.nodeId);
                runtime.commit(pass.valueUniforms, motionGate);
            }
        }

        for (const [nodeId, runtime] of runtimes) {
            if (!present.has(nodeId)) {
                runtime.dispose();
                runtimes.delete(nodeId);
            }
        }
    });

    useEffect(() => {
        return () => {
            runtimes.forEach(runtime => { runtime.dispose() });
        };
    }, [runtimes]);

    return memo.result;
};
