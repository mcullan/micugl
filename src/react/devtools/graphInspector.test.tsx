import { act, type ReactElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import type { ShaderNode } from '@/core/lib/graphPlanning';
import { planGraph, shaderNode } from '@/core/lib/graphPlanning';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import { ShaderGraph } from '@/react/components/ShaderGraph';
import type { EngineHandle, GraphDebugPort } from '@/react/devtools/beacon';
import { listEngines } from '@/react/devtools/beacon';
import { MicuglDevtools } from '@/react/devtools/MicuglDevtools';
import { GraphPanel } from '@/react/devtools/panels/GraphPanel';
import type { UniformListEntry } from '@/react/lib/liveUniformUpdaters';
import type { GLStubConfig, GLStubHandle } from '@/testing';
import { createGLStub } from '@/testing';
import type { FrameQueue } from '@/testing/frameQueue';
import { createFrameQueue } from '@/testing/frameQueue';

const WIDTH = 320;
const HEIGHT = 200;

const CHILD_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_gain: 'float' }
});

const TINT_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_shade: 'float' }
});

const ROOT_CONFIG = createShaderConfig({
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniformNames: { u_mix: 'float' }
});

let container: HTMLDivElement;
let root: Root;
let frames: FrameQueue;
let stub: GLStubHandle;
let originalGetContext: unknown;
let originalToBlob: unknown;

class ImageDataStub {
    constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
    ) {}
}

function installStub(config: GLStubConfig = {}): void {
    stub = createGLStub(config);
}

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    frames = createFrameQueue();
    globalThis.requestAnimationFrame = frames.schedule as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = frames.cancel;

    installStub();

    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    originalGetContext = canvasProto.getContext;
    originalToBlob = canvasProto.toBlob;
    canvasProto.getContext = function stubGetContext(type: string): unknown {
        if (type === '2d') {
            return new Proxy({}, {
                get: () => () => undefined,
                set: () => true
            });
        }
        return stub.gl;
    };
    canvasProto.toBlob = function stubToBlob(callback: (blob: Blob) => void, type?: string): void {
        callback(new Blob([], { type: type ?? 'image/png' }));
    };

    (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
    const canvasProto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;
    delete (globalThis as { ImageData?: unknown }).ImageData;
});

async function mount(element: ReactElement): Promise<void> {
    await act(async () => {
        root.render(element);
        await Promise.resolve();
    });
}

interface ShadowMount {
    root: Root;
    shadow: ShadowRoot;
    host: HTMLElement;
}

function createShadowMount(): ShadowMount {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.appendChild(inner);
    return { root: createRoot(inner), shadow, host };
}

function currentHandle(): EngineHandle {
    const handle = listEngines().at(-1);
    if (!handle) {
        throw new Error('no engine mounted');
    }
    return handle;
}

function currentGraph(): GraphDebugPort {
    const graph = currentHandle().graph;
    if (!graph) {
        throw new Error('the mounted engine exposes no graph debug port');
    }
    return graph;
}

function uploads(name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

function valueOf(entries: UniformListEntry[], name: string): unknown {
    const entry = entries.find(candidate => candidate.name === name);
    if (!entry) {
        throw new Error(`no entry named ${name}`);
    }
    return entry.value;
}

function sharedGainGraph(glowGain: number, grainGain: number, mix: number, rootOptions?: { clear: boolean }): ShaderNode {
    const glow = shaderNode({
        id: 'glow',
        shaderConfig: CHILD_CONFIG,
        uniforms: { gain: { type: 'float', value: glowGain } },
        width: 16,
        height: 8
    });
    const grain = shaderNode({
        id: 'grain',
        shaderConfig: CHILD_CONFIG,
        uniforms: { gain: { type: 'float', value: grainGain } },
        width: 32,
        height: 4
    });
    return shaderNode({
        id: 'root',
        shaderConfig: ROOT_CONFIG,
        uniforms: { a: glow, b: grain, mix: { type: 'float', value: mix } },
        renderOptions: rootOptions
    });
}

function graphScene(node: ShaderNode): ReactElement {
    return (
        <ShaderGraph
            root={node}
            width={WIDTH}
            height={HEIGHT}
            useDevicePixelRatio={false}
            frameloop='demand'
            reducedMotion='ignore'
            saveData='ignore'
        />
    );
}

describe('graph inspector: combined port attribution (T1)', () => {
    it('lists both shared-name entries, each stamped with its own node id and value', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const gainEntries = currentHandle().uniforms?.list().filter(entry => entry.name === 'u_gain') ?? [];
        expect(gainEntries.map(entry => [entry.nodeId, entry.value])).toEqual([
            ['glow', 0.25],
            ['grain', 0.75]
        ]);
    });
});

describe('graph inspector: combined-port fan (T2)', () => {
    it('fans a name-addressed override across every declaring node and restores distinct bases', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const handle = currentHandle();
        const graph = currentGraph();

        act(() => { handle.uniforms?.setOverride('u_gain', 0.5) });
        expect(valueOf(graph.nodeUniforms('glow').list(), 'u_gain')).toBe(0.5);
        expect(valueOf(graph.nodeUniforms('grain').list(), 'u_gain')).toBe(0.5);

        act(() => { handle.uniforms?.clearOverride('u_gain') });
        expect(valueOf(graph.nodeUniforms('glow').list(), 'u_gain')).toBe(0.25);
        expect(valueOf(graph.nodeUniforms('grain').list(), 'u_gain')).toBe(0.75);
    });
});

describe('graph inspector: node-scoped override (T3)', () => {
    it('changes only the targeted node and leaves the sibling that shares the name untouched', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const graph = currentGraph();
        act(() => { graph.nodeUniforms('glow').setOverride('u_gain', 0.9) });

        expect(valueOf(graph.nodeUniforms('glow').list(), 'u_gain')).toBe(0.9);
        expect(valueOf(graph.nodeUniforms('grain').list(), 'u_gain')).toBe(0.75);
    });
});

describe('graph inspector: unknown ids fail loud through the public path (T4)', () => {
    it('names the unknown id and the known ids for both nodeUniforms and readNode', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const graph = currentGraph();
        expect(() => graph.nodeUniforms('nope')).toThrow(/nope[\s\S]*glow[\s\S]*grain[\s\S]*root/);
        expect(() => graph.readNode('nope')).toThrow(/nope[\s\S]*glow[\s\S]*grain[\s\S]*root/);
    });
});

describe('graph inspector: topology is the compiler own output (T5)', () => {
    it('deep-equals planGraph topology for the same root, never a hand-written tree', async () => {
        const rootNode = sharedGainGraph(0.25, 0.75, 0.875);
        await mount(graphScene(rootNode));
        act(() => { frames.tick(0) });

        expect(currentGraph().topology()).toEqual(planGraph(rootNode).topology);
    });
});

describe('graph inspector: handle fields are live getters, not init-time snapshots (T6)', () => {
    it('rebuilds the port on a renderOptions-only change while the manager survives', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875, { clear: true })));
        act(() => { frames.tick(0) });

        const handle = currentHandle();
        const managerBefore = handle.getManager();
        const portBefore = handle.uniforms;
        expect(portBefore).toBeDefined();

        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875, { clear: false })));
        act(() => { frames.tick(16) });

        const managerAfter = handle.getManager();
        const portAfter = handle.uniforms;

        expect(managerAfter).toBe(managerBefore);
        expect(portAfter).not.toBe(portBefore);
        expect(() => handle.graph?.nodeUniforms('root').list()).not.toThrow();
    });
});

describe('graph inspector: a wiring swap re-inits and reports the swapped wiring (T6b)', () => {
    it('changes manager identity and shows the swapped edges after the swap', async () => {
        const build = (leftId: string, rightId: string): ShaderNode => {
            const a = shaderNode({
                id: 'a',
                shaderConfig: CHILD_CONFIG,
                uniforms: { gain: { type: 'float', value: 0.25 } },
                width: 16,
                height: 8
            });
            const b = shaderNode({
                id: 'b',
                shaderConfig: CHILD_CONFIG,
                uniforms: { gain: { type: 'float', value: 0.75 } },
                width: 32,
                height: 4
            });
            const byId: Record<string, ShaderNode> = { a, b };
            return shaderNode({
                id: 'root',
                shaderConfig: ROOT_CONFIG,
                uniforms: { left: byId[leftId], right: byId[rightId], mix: { type: 'float', value: 0.875 } }
            });
        };

        await mount(graphScene(build('a', 'b')));
        act(() => { frames.tick(0) });
        const managerBefore = currentHandle().getManager();

        await mount(graphScene(build('b', 'a')));
        act(() => { frames.tick(16) });

        const handleAfter = currentHandle();
        expect(handleAfter.getManager()).not.toBe(managerBefore);

        const rootNode = handleAfter.graph?.topology().nodes.find(node => node.id === 'root');
        const edgeFor = (sampler: string): string | undefined =>
            rootNode?.edges.find(edge => edge.samplerName === sampler)?.childId;
        expect(edgeFor('u_left')).toBe('b');
        expect(edgeFor('u_right')).toBe('a');
    });
});

describe('graph inspector: node ports stay live through a StrictMode remount and node addition (T7)', () => {
    it('advances a function uniform, then resolves a node added after first render and lands its override on GL', async () => {
        const build = (withChild: boolean): ShaderNode => {
            const childA = shaderNode({
                id: 'a',
                shaderConfig: CHILD_CONFIG,
                uniforms: { gain: { type: 'float', value: (time?: number) => time ?? 0 } },
                width: 16,
                height: 8
            });
            const childB = shaderNode({
                id: 'b',
                shaderConfig: TINT_CONFIG,
                uniforms: { shade: { type: 'float', value: 0.125 } },
                width: 8,
                height: 8
            });
            return shaderNode({
                id: 'root',
                shaderConfig: ROOT_CONFIG,
                uniforms: withChild
                    ? { a: childA, b: childB, mix: { type: 'float', value: 0.875 } }
                    : { a: childA, mix: { type: 'float', value: 0.875 } }
            });
        };

        const scene = (withChild: boolean): ReactElement => (
            <StrictMode>
                <ShaderGraph
                    root={build(withChild)}
                    width={WIDTH}
                    height={HEIGHT}
                    useDevicePixelRatio={false}
                    frameloop='always'
                    reducedMotion='ignore'
                    saveData='ignore'
                />
            </StrictMode>
        );

        await mount(scene(false));
        act(() => { frames.tick(0) });
        act(() => { frames.tick(16) });
        act(() => { frames.tick(32) });

        const gainUploads = uploads('u_gain') as number[];
        expect(gainUploads.length).toBeGreaterThanOrEqual(2);
        expect(gainUploads[gainUploads.length - 1]).toBeGreaterThan(gainUploads[0]);

        await mount(scene(true));
        act(() => { frames.tick(48) });

        const graph = currentGraph();
        expect(graph.nodeUniforms('b').list().map(entry => entry.name)).toContain('u_shade');

        act(() => { graph.nodeUniforms('b').setOverride('u_shade', 0.9) });
        act(() => { frames.tick(64) });
        expect(uploads('u_shade')).toContain(0.9);
    });
});

describe('graph inspector: readNode plumbing addresses the node own framebuffer (T8)', () => {
    it('reads each child from its own framebuffer dims and the root from the canvas', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const graph = currentGraph();
        const glow = graph.readNode('glow');
        const grain = graph.readNode('grain');
        const rootRead = graph.readNode('root');

        expect('width' in glow ? [glow.width, glow.height] : glow).toEqual([16, 8]);
        expect('width' in grain ? [grain.width, grain.height] : grain).toEqual([32, 4]);
        expect('width' in rootRead ? [rootRead.width, rootRead.height] : rootRead).toEqual([WIDTH, HEIGHT]);
    });
});

describe('graph inspector: unreadable variants surface verbatim (T9)', () => {
    it('passes the debugReadFramebuffer maxSize refusal through readNode unchanged', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const handle = currentHandle();
        const graph = handle.graph;
        if (!graph) {
            throw new Error('no graph port');
        }
        const throughReadNode = graph.readNode('glow', 4);
        const direct = handle.getManager()?.fbo.debugReadFramebuffer('glow-out', 4);

        expect(throughReadNode).toEqual({ unreadable: 'framebuffer 16x8 exceeds capture maxSize 4' });
        expect(throughReadNode).toEqual(direct);
    });
});

describe('graph inspector: dead-engine grace vs caller error (T10)', () => {
    it('degrades a valid node to unreadable after unmount but still throws for an unknown id', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });
        const handle = currentHandle();

        await act(async () => {
            root.render(<div />);
            await Promise.resolve();
        });

        expect(handle.graph?.readNode('glow')).toEqual({ unreadable: 'engine destroyed' });
        expect(() => handle.graph?.readNode('nope')).toThrow(/nope/);
    });
});

describe('graph inspector: the root read restores the framebuffer binding (T11)', () => {
    it('leaves FRAMEBUFFER_BINDING at its pre-call value after a root readNode', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });

        const handle = currentHandle();
        const gl = handle.getManager()?.context;
        if (!gl) {
            throw new Error('no gl context');
        }
        const sentinel = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, sentinel);

        const result = handle.graph?.readNode('root');
        expect(result && 'width' in result).toBe(true);
        expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(sentinel);
    });
});

function fakeGraphPort(): GraphDebugPort {
    const listFor = (nodeId: string): UniformListEntry[] => [
        { name: `u_${nodeId}`, type: 'float', value: 0.5, overridden: false, nodeId }
    ];
    return {
        topology: () => ({
            rootId: 'root',
            nodes: [
                { id: 'leaf', framebufferId: 'leaf-out', width: 16, height: 8, edges: [], sources: [{ samplerName: 'u_img', sourceId: 'clip' }], uniformNames: ['u_leaf'] },
                { id: 'mid', framebufferId: 'mid-out', width: 64, height: 64, edges: [{ samplerName: 'u_src', childId: 'leaf' }], sources: [], uniformNames: ['u_mid'] },
                { id: 'root', framebufferId: null, width: 0, height: 0, edges: [{ samplerName: 'u_warped', childId: 'mid' }], sources: [], uniformNames: ['u_root'] }
            ]
        }),
        nodeUniforms: nodeId => ({
            list: () => listFor(nodeId),
            setOverride: () => undefined,
            clearOverride: () => undefined
        }),
        readNode: () => ({ unreadable: 'zero frames captured' })
    };
}

function fakeEngine(graph: GraphDebugPort): EngineHandle {
    return {
        id: 'fake',
        kind: 'pingpong',
        getManager: () => null,
        getState: () => ({
            kind: 'pingpong',
            id: 'fake',
            canvas: { renderWidth: 0, renderHeight: 0, displayWidth: 0, displayHeight: 0 },
            programIds: [],
            framebufferIds: [],
            capabilities: {
                floatRenderable: false,
                halfFloatRenderable: false,
                floatLinearFilterable: false,
                halfFloatLinearFilterable: false,
                halfFloatType: 0
            },
            floatFilterDowngraded: false
        }),
        graph
    };
}

describe('graph inspector: GraphPanel renders the topology tree (T12 panel side)', () => {
    it('lists nodes in topological order with source leaves and per-node uniform rows', async () => {
        const panel = createShadowMount();
        await act(async () => {
            panel.root.render(<GraphPanel engine={fakeEngine(fakeGraphPort())} captureTick={0} />);
            await Promise.resolve();
        });

        const text = panel.shadow.textContent ?? '';
        const leafIndex = text.indexOf('leaf');
        const midIndex = text.indexOf('mid');
        const rootIndex = text.indexOf('root');
        expect(leafIndex).toBeGreaterThanOrEqual(0);
        expect(leafIndex).toBeLessThan(midIndex);
        expect(midIndex).toBeLessThan(rootIndex);

        expect(text).toContain('src: clip');
        expect(panel.shadow.querySelector('[aria-label="u_leaf"]')).not.toBeNull();
        expect(panel.shadow.querySelector('[aria-label="u_mid"]')).not.toBeNull();
        expect(panel.shadow.querySelector('[aria-label="u_root"]')).not.toBeNull();

        act(() => { panel.root.unmount() });
        panel.host.remove();
    });

    it('shows the unreadable reason in the thumbnail placeholder when a node is captured', async () => {
        const panel = createShadowMount();
        await act(async () => {
            panel.root.render(<GraphPanel engine={fakeEngine(fakeGraphPort())} captureTick={0} />);
            await Promise.resolve();
        });

        const captureButton = Array.from(panel.shadow.querySelectorAll('button'))
            .find(button => button.textContent === 'capture');
        expect(captureButton).toBeDefined();
        await act(async () => {
            captureButton?.click();
            await Promise.resolve();
        });
        await act(async () => {
            panel.root.render(<GraphPanel engine={fakeEngine(fakeGraphPort())} captureTick={1} />);
            await Promise.resolve();
        });

        expect(panel.shadow.textContent).toContain('zero frames captured');

        act(() => { panel.root.unmount() });
        panel.host.remove();
    });
});

async function tickDevtools(timestamps: number[]): Promise<void> {
    for (const timestamp of timestamps) {
        await act(async () => {
            frames.tick(timestamp);
            await Promise.resolve();
        });
    }
}

function devtoolsText(): string {
    const host = document.querySelector('[data-micugl-devtools]');
    return host?.shadowRoot?.textContent ?? '';
}

describe('graph inspector: MicuglDevtools swaps in the graph panel (T12 integration, T14)', () => {
    it('shows the graph section and hides the flat uniforms and framebuffers panels for a graph engine', async () => {
        await mount(
            <>
                {graphScene(sharedGainGraph(0.25, 0.75, 0.875))}
                <MicuglDevtools defaultOpen />
            </>
        );
        await tickDevtools([0, 120, 240, 360]);

        const text = devtoolsText();
        expect(text).toContain('graph');
        expect(text).toContain('glow');
        expect(text).toContain('grain');
        expect(text).not.toContain('framebuffers');
    });
});

describe('graph inspector: panel override hygiene (T13)', () => {
    it('clears panel-set overrides on unmount but leaves overrides set outside the panel', async () => {
        await mount(graphScene(sharedGainGraph(0.25, 0.75, 0.875)));
        act(() => { frames.tick(0) });
        const handle = currentHandle();

        const panel = createShadowMount();
        await act(async () => {
            panel.root.render(<GraphPanel engine={handle} captureTick={0} />);
            await Promise.resolve();
        });

        const glowInput = panel.shadow.querySelectorAll('[aria-label="u_gain"]')[0];
        expect(glowInput).toBeDefined();
        await act(async () => {
            glowInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
            await Promise.resolve();
        });

        act(() => { handle.graph?.nodeUniforms('grain').setOverride('u_gain', 0.6) });

        expect(handle.graph?.nodeUniforms('glow').list()[0].overridden).toBe(true);
        expect(handle.graph?.nodeUniforms('grain').list()[0].overridden).toBe(true);

        act(() => { panel.root.unmount() });
        panel.host.remove();

        expect(handle.graph?.nodeUniforms('glow').list()[0].overridden).toBe(false);
        expect(handle.graph?.nodeUniforms('grain').list()[0].overridden).toBe(true);
    });
});

describe('graph inspector: single-program engines keep the flat uniforms panel (T14 negative)', () => {
    it('shows the uniforms panel and no graph section for a single-program engine', async () => {
        await mount(
            <>
                <BaseShaderComponent
                    programId='solid'
                    shaderConfig={CHILD_CONFIG}
                    uniforms={{ gain: { type: 'float', value: 0.375 } }}
                    width={WIDTH}
                    height={HEIGHT}
                    useDevicePixelRatio={false}
                    frameloop='demand'
                    reducedMotion='ignore'
                    saveData='ignore'
                />
                <MicuglDevtools defaultOpen />
            </>
        );
        await tickDevtools([0, 120, 240, 360]);

        const text = devtoolsText();
        expect(text).toContain('uniforms');
        expect(currentHandle().graph).toBeUndefined();
    });
});
