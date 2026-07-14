import { useEffect, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { combineFrameInvalidation } from '@/core/lib/frameInvalidation';
import type { GraphPlan, GraphTopology, ShaderNode } from '@/core/lib/graphPlanning';
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

export interface GraphDebugSource {
    topology: () => GraphTopology;
    nodeUniforms: (nodeId: string) => UniformDebugPort;
}

export interface ShaderGraphResult {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers: Record<string, FramebufferOptions>;
    textureSources: TextureSource[];
    port: UniformDebugPort;
    graphDebug: GraphDebugSource;
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
    updaters: Record<string, UniformUpdaterDef[]>,
    graphDebug: GraphDebugSource
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
        port: combineUniformDebugPorts(
            plan.passes.map((pass, index) => ({ nodeId: pass.nodeId, port: runtimes[index].port }))
        ),
        graphDebug,
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

    const topologyRef = useRef(plan.topology);
    topologyRef.current = plan.topology;

    const graphDebugRef = useRef<GraphDebugSource | null>(null);
    graphDebugRef.current ??= {
        topology: () => topologyRef.current,
        nodeUniforms: (nodeId: string): UniformDebugPort => {
            const runtime = runtimesRef.current.get(nodeId);
            if (!runtime) {
                const known = [...runtimesRef.current.keys()].join(', ');
                throw new Error(
                    `micugl devtools: graph has no node "${nodeId}". Known node ids: ${known}.`
                );
            }
            return runtime.port;
        }
    };
    const graphDebug = graphDebugRef.current;

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
            result: buildResult(plan, ordered, updatersByNode, graphDebug)
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
