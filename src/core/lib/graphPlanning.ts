import { GL_LINEAR } from '@/core/lib/glConstants';
import { normalizeUniformName } from '@/core/lib/uniformNames';
import type {
    FramebufferOptions,
    RenderOptions,
    RenderPass,
    ShaderProgramConfig,
    TextureOptions,
    TextureSource,
    UniformConfig,
    UniformParam
} from '@/types';

export interface ShaderNode {
    kind: 'shader-node';
    id: string;
    shaderConfig: ShaderProgramConfig;
    uniforms: Record<string, GraphUniformValue>;
    width?: number;
    height?: number;
    textureOptions?: Partial<TextureOptions>;
    renderOptions?: RenderOptions;
}

export type GraphUniformValue = UniformParam | ShaderNode | TextureSource;

export type PlannedInput =
    | { kind: 'node'; childId: string; samplerName: string; textureUnit: number }
    | { kind: 'source'; sourceId: string; samplerName: string; textureUnit: number };

export interface PlannedPass {
    nodeId: string;
    programId: string;
    outputFramebufferId: string | null;
    inputs: PlannedInput[];
    renderOptions: RenderOptions | undefined;
}

export interface GraphTopologyNode {
    id: string;
    framebufferId: string | null;
    width: number;
    height: number;
    edges: { samplerName: string; childId: string }[];
    sources: { samplerName: string; sourceId: string }[];
    uniformNames: string[];
}

export interface GraphTopology {
    rootId: string;
    nodes: GraphTopologyNode[];
}

export interface GraphPlan {
    order: ShaderNode[];
    programConfigs: Record<string, ShaderProgramConfig>;
    framebuffers: Record<string, FramebufferOptions>;
    passes: PlannedPass[];
    sources: TextureSource[];
    topology: GraphTopology;
}

const DEFAULT_MAX_TEXTURE_UNITS = 8;

export function shaderNode(node: Omit<ShaderNode, 'kind'>): ShaderNode {
    return { kind: 'shader-node', ...node };
}

export function isShaderNode(value: GraphUniformValue): value is ShaderNode {
    const candidate = value as unknown;
    return typeof candidate === 'object'
        && candidate !== null
        && (candidate as { kind?: unknown }).kind === 'shader-node';
}

function isTextureSource(value: unknown): value is TextureSource {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { getFrame?: unknown }).getFrame === 'function';
}

function isUniformParam(value: unknown): value is UniformParam {
    return typeof value === 'object'
        && value !== null
        && 'type' in value
        && 'value' in value;
}

function framebufferId(nodeId: string): string {
    return `${nodeId}-out`;
}

function augmentConfig(config: ShaderProgramConfig, samplerNames: string[]): ShaderProgramConfig {
    const declared = new Set(config.uniforms.map(uniform => uniform.name));
    const additions: UniformConfig[] = [];

    for (const samplerName of samplerNames) {
        if (declared.has(samplerName)) {
            continue;
        }
        declared.add(samplerName);
        additions.push({ name: samplerName, type: 'sampler2D' });
    }

    if (additions.length === 0) {
        return config;
    }

    return { ...config, uniforms: [...config.uniforms, ...additions] };
}

interface PlanState {
    maxTextureUnits: number;
    order: ShaderNode[];
    programConfigs: Record<string, ShaderProgramConfig>;
    framebuffers: Record<string, FramebufferOptions>;
    passes: PlannedPass[];
    sources: TextureSource[];
    sourceById: Map<string, TextureSource>;
    idToNode: Map<string, ShaderNode>;
    onStack: Set<ShaderNode>;
    pathStack: string[];
    topologyNodes: GraphTopologyNode[];
}

function registerSource(state: PlanState, nodeId: string, source: TextureSource): void {
    const existing = state.sourceById.get(source.id);
    if (existing === undefined) {
        state.sourceById.set(source.id, source);
        state.sources.push(source);
        return;
    }
    if (existing !== source) {
        throw new Error(
            `micugl graph: node "${nodeId}" feeds a texture source with id "${source.id}", but a different source `
            + 'object already claims that id in this graph. One id owns one GL texture and one upload version, so '
            + 'two sources sharing an id would upload over each other. Give each source its own id.'
        );
    }
}

function visit(state: PlanState, node: ShaderNode, isRoot: boolean): void {
    if (state.onStack.has(node)) {
        const cyclePath = [...state.pathStack, node.id].join(' -> ');
        throw new Error(`micugl graph: cycle detected: ${cyclePath}. Shader graphs must be acyclic.`);
    }

    const existing = state.idToNode.get(node.id);
    if (existing !== undefined) {
        if (existing !== node) {
            throw new Error(
                `micugl graph: two different nodes share the id "${node.id}". Each node id names one framebuffer and `
                + 'one program, so a duplicate id would collide their outputs. Give each node a unique id.'
            );
        }
        return;
    }

    if (isRoot && (node.width !== undefined || node.height !== undefined)) {
        throw new Error(
            `micugl graph: the root node "${node.id}" declares width/height, but the root renders to the canvas, `
            + 'whose size is set by the component props. Remove width/height on the root node.'
        );
    }

    state.onStack.add(node);
    state.pathStack.push(node.id);
    state.idToNode.set(node.id, node);

    const inputs: PlannedInput[] = [];
    const childNodes: ShaderNode[] = [];
    const edges: { samplerName: string; childId: string }[] = [];
    const sourceRefs: { samplerName: string; sourceId: string }[] = [];
    const uniformNames: string[] = [];
    const samplerNames: string[] = [];
    const samplerNameSet = new Set<string>();
    const valueNameSet = new Set<string>();
    let textureUnit = 0;

    const claimSampler = (samplerName: string): void => {
        if (samplerNameSet.has(samplerName)) {
            throw new Error(
                `micugl graph: node "${node.id}" has two texture inputs that both resolve to sampler "${samplerName}". `
                + 'One sampler holds one texture, so the second would overwrite the first. Rename one of the uniforms.'
            );
        }
        samplerNameSet.add(samplerName);
        samplerNames.push(samplerName);
    };

    for (const [key, value] of Object.entries(node.uniforms)) {
        if (isShaderNode(value)) {
            const samplerName = normalizeUniformName(key);
            claimSampler(samplerName);
            edges.push({ samplerName, childId: value.id });
            inputs.push({ kind: 'node', childId: value.id, samplerName, textureUnit });
            childNodes.push(value);
            textureUnit += 1;
            continue;
        }
        if (isTextureSource(value)) {
            const samplerName = normalizeUniformName(key);
            claimSampler(samplerName);
            registerSource(state, node.id, value);
            sourceRefs.push({ samplerName, sourceId: value.id });
            inputs.push({ kind: 'source', sourceId: value.id, samplerName, textureUnit });
            textureUnit += 1;
            continue;
        }
        if (isUniformParam(value)) {
            const valueName = normalizeUniformName(key);
            if (valueNameSet.has(valueName)) {
                throw new Error(
                    `micugl graph: node "${node.id}" has two value uniforms that both resolve to "${valueName}". `
                    + 'One name names one uniform, so the second would overwrite the first. Rename one of the uniforms.'
                );
            }
            valueNameSet.add(valueName);
            uniformNames.push(valueName);
            continue;
        }
        throw new Error(
            `micugl graph: node "${node.id}" gives uniform "${key}" a value that is not a uniform param, a shader `
            + 'node, or a texture source. A graph uniform must be one of those three. Check the value you passed.'
        );
    }

    if (textureUnit > state.maxTextureUnits) {
        throw new Error(
            `micugl graph: node "${node.id}" binds ${textureUnit} texture inputs, past the limit of `
            + `${state.maxTextureUnits} texture units for one node. Reduce the node's texture inputs, or split the `
            + 'work across more graph nodes.'
        );
    }

    for (const samplerName of samplerNames) {
        if (valueNameSet.has(samplerName)) {
            throw new Error(
                `micugl graph: node "${node.id}" uses "${samplerName}" for both a texture sampler and a value `
                + 'uniform. One name names one uniform. Rename one of them.'
            );
        }
    }

    for (const child of childNodes) {
        visit(state, child, false);
    }

    const outputFramebufferId = isRoot ? null : framebufferId(node.id);
    if (!isRoot) {
        state.framebuffers[framebufferId(node.id)] = {
            width: node.width ?? 0,
            height: node.height ?? 0,
            textureCount: 1,
            textureOptions: node.textureOptions ?? { minFilter: GL_LINEAR, magFilter: GL_LINEAR }
        };
    }

    state.programConfigs[node.id] = augmentConfig(node.shaderConfig, samplerNames);

    state.passes.push({
        nodeId: node.id,
        programId: node.id,
        outputFramebufferId,
        inputs,
        renderOptions: node.renderOptions
    });

    state.order.push(node);

    state.topologyNodes.push({
        id: node.id,
        framebufferId: outputFramebufferId,
        width: node.width ?? 0,
        height: node.height ?? 0,
        edges,
        sources: sourceRefs,
        uniformNames
    });

    state.onStack.delete(node);
    state.pathStack.pop();
}

export function planGraph(root: ShaderNode, options?: { maxTextureUnits?: number }): GraphPlan {
    const state: PlanState = {
        maxTextureUnits: options?.maxTextureUnits ?? DEFAULT_MAX_TEXTURE_UNITS,
        order: [],
        programConfigs: {},
        framebuffers: {},
        passes: [],
        sources: [],
        sourceById: new Map(),
        idToNode: new Map(),
        onStack: new Set(),
        pathStack: [],
        topologyNodes: []
    };

    visit(state, root, true);

    return {
        order: state.order,
        programConfigs: state.programConfigs,
        framebuffers: state.framebuffers,
        passes: state.passes,
        sources: state.sources,
        topology: { rootId: root.id, nodes: state.topologyNodes }
    };
}

export function toRenderPasses(
    plan: GraphPlan,
    uniformsFor: (nodeId: string) => RenderPass['uniforms']
): RenderPass[] {
    return plan.passes.map(pass => ({
        programId: pass.programId,
        inputTextures: pass.inputs.map(input =>
            input.kind === 'node'
                ? {
                    id: framebufferId(input.childId),
                    textureUnit: input.textureUnit,
                    bindingType: 'read' as const,
                    samplerName: input.samplerName
                }
                : {
                    id: input.sourceId,
                    textureUnit: input.textureUnit,
                    bindingType: 'source' as const,
                    samplerName: input.samplerName
                }
        ),
        outputFramebuffer: pass.outputFramebufferId,
        uniforms: uniformsFor(pass.nodeId),
        renderOptions: pass.renderOptions ?? { clear: true }
    }));
}
