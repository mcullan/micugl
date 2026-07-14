import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { GraphTopology } from '@/core/lib/graphPlanning';
import type { EngineHandle, GraphDebugPort } from '@/react/devtools/beacon';
import { listEngines } from '@/react/devtools/beacon';
import { isColorUniform } from '@/react/devtools/lib/detectColor';
import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';
import { paintFramebufferThumbnail } from '@/react/devtools/lib/thumbnail';
import type { ColorMode } from '@/react/devtools/lib/UniformRow';
import { UniformRow } from '@/react/devtools/lib/UniformRow';

interface GraphPanelProps {
    engine: EngineHandle;
    captureTick: number;
}

const THUMBNAIL_WIDTH = 96;
const THUMBNAIL_HEIGHT = 96;
const CAPTURE_MAX_SIZE = 1024;

const placeholderStyle = {
    width: `${THUMBNAIL_WIDTH}px`,
    height: `${THUMBNAIL_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    fontSize: '9px',
    color: COLORS.warn,
    border: `1px dashed ${COLORS.border}`,
    borderRadius: '4px',
    padding: '4px',
    boxSizing: 'border-box' as const
};

const thumbnailCanvasStyle = {
    width: `${THUMBNAIL_WIDTH}px`,
    height: `${THUMBNAIL_HEIGHT}px`,
    display: 'block',
    background: 'rgba(0,0,0,0.25)',
    borderRadius: '4px'
};

const nodeBlockStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '6px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px'
};

const dimsLabel = (width: number, height: number): string =>
    width > 0 && height > 0 ? `${width}x${height}` : 'canvas';

const trackKey = (nodeId: string, name: string): string => `${nodeId}\u0001${name}`;

export const GraphPanel = ({ engine, captureTick }: GraphPanelProps): ReactElement | null => {
    const graph = engine.graph;
    const engineId = engine.id;

    const [captureOn, setCaptureOn] = useState<Record<string, boolean>>({});
    const [unreadableByNode, setUnreadableByNode] = useState<Record<string, string>>({});
    const [errorsByKey, setErrorsByKey] = useState<Record<string, string>>({});
    const [colorModeByKey, setColorModeByKey] = useState<Record<string, ColorMode>>({});

    const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const scratchRef = useRef<HTMLCanvasElement | null>(null);
    const trackedRef = useRef<Map<string, Set<string>>>(new Map());

    const graphRef = useRef<GraphDebugPort | undefined>(graph);
    const captureOnRef = useRef(captureOn);
    const topologyRef = useRef<GraphTopology | null>(null);

    useEffect(() => {
        graphRef.current = graph;
        captureOnRef.current = captureOn;
    });

    useEffect(() => {
        const currentGraph = graphRef.current;
        if (!currentGraph) {
            return;
        }
        const topology = topologyRef.current;
        if (!topology) {
            return;
        }
        for (const node of topology.nodes) {
            if (!captureOnRef.current[node.id]) {
                continue;
            }
            const result = currentGraph.readNode(node.id, CAPTURE_MAX_SIZE);
            if ('unreadable' in result) {
                setUnreadableByNode(prev =>
                    prev[node.id] === result.unreadable ? prev : { ...prev, [node.id]: result.unreadable }
                );
                continue;
            }
            setUnreadableByNode(prev => {
                if (!(node.id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                Reflect.deleteProperty(next, node.id);
                return next;
            });
            const canvas = canvasRefs.current.get(node.id);
            if (!canvas) {
                continue;
            }
            paintFramebufferThumbnail(canvas, scratchRef, result);
        }
    }, [captureTick]);

    useEffect(() => () => {
        const handle = listEngines().find(candidate => candidate.id === engineId);
        const port = handle?.graph;
        if (port) {
            const known = new Set(port.topology().nodes.map(node => node.id));
            for (const [nodeId, names] of trackedRef.current) {
                if (!known.has(nodeId)) {
                    continue;
                }
                const nodePort = port.nodeUniforms(nodeId);
                for (const name of names) {
                    if (nodePort.list().some(entry => entry.name === name && entry.overridden)) {
                        nodePort.clearOverride(name);
                    }
                }
            }
        }
        trackedRef.current = new Map();
    }, [engineId]);

    if (!graph) {
        return null;
    }

    const topology = graph.topology();
    topologyRef.current = topology;

    const toggleCapture = (nodeId: string): void => {
        setCaptureOn(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
    };

    const track = (nodeId: string, name: string): void => {
        const names = trackedRef.current.get(nodeId) ?? new Set<string>();
        names.add(name);
        trackedRef.current.set(nodeId, names);
    };

    const setError = (key: string, message: string): void => {
        setErrorsByKey(prev => ({ ...prev, [key]: message }));
    };

    const clearError = (key: string): void => {
        setErrorsByKey(prev => {
            if (!(key in prev)) {
                return prev;
            }
            const next = { ...prev };
            Reflect.deleteProperty(next, key);
            return next;
        });
    };

    const handleSetOverride = (nodeId: string, name: string, value: number | ArrayLike<number>): void => {
        const key = trackKey(nodeId, name);
        try {
            graph.nodeUniforms(nodeId).setOverride(name, value);
            track(nodeId, name);
            clearError(key);
        } catch (error) {
            setError(key, error instanceof Error ? error.message : String(error));
        }
    };

    const handleClearOverride = (nodeId: string, name: string): void => {
        const key = trackKey(nodeId, name);
        try {
            graph.nodeUniforms(nodeId).clearOverride(name);
            clearError(key);
        } catch (error) {
            setError(key, error instanceof Error ? error.message : String(error));
        }
    };

    const handleToggleMode = (nodeId: string, name: string): void => {
        const key = trackKey(nodeId, name);
        setColorModeByKey(prev => {
            const current = prev[key] ?? 'auto';
            const currentlyColor = current === 'color' || (current === 'auto' && isColorUniform(name));
            const next: ColorMode = currentlyColor ? 'number' : 'color';
            return { ...prev, [key]: next };
        });
    };

    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>graph</div>
            <div style={{ fontSize: '10px', color: COLORS.warn }}>
                capture stalls the GPU pipeline {'\u2014'} perturbs timing; thumbnails draw at node aspect
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {topology.nodes.map(node => {
                    const uniforms = graph.nodeUniforms(node.id).list();
                    const capturing = captureOn[node.id] ?? false;
                    const unreadable = unreadableByNode[node.id];
                    return (
                        <div key={node.id} style={nodeBlockStyle}>
                            <div style={rowStyle}>
                                <span style={{ fontSize: '11px', color: COLORS.text, fontWeight: 600 }}>
                                    {node.id}
                                </span>
                                <span style={{ fontSize: '10px', color: COLORS.dim }}>
                                    {dimsLabel(node.width, node.height)}
                                </span>
                            </div>
                            {node.edges.map(edge => (
                                <div
                                    key={`${edge.samplerName}\u0001${edge.childId}`}
                                    style={{ fontSize: '10px', color: COLORS.dim }}
                                >
                                    {'\u2192'} {edge.childId} ({edge.samplerName})
                                </div>
                            ))}
                            {node.sources.map(source => (
                                <div
                                    key={`${source.samplerName}\u0001${source.sourceId}`}
                                    style={{ fontSize: '10px', color: COLORS.dim }}
                                >
                                    src: {source.sourceId} ({source.samplerName})
                                </div>
                            ))}
                            {uniforms.length > 0
                                ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {uniforms.map(entry => (
                                            <UniformRow
                                                key={entry.name}
                                                entry={entry}
                                                mode={colorModeByKey[trackKey(node.id, entry.name)] ?? 'auto'}
                                                error={errorsByKey[trackKey(node.id, entry.name)]}
                                                onToggleMode={name => { handleToggleMode(node.id, name) }}
                                                onSetOverride={(name, value) => { handleSetOverride(node.id, name, value) }}
                                                onClearOverride={name => { handleClearOverride(node.id, name) }}
                                            />
                                        ))}
                                    </div>
                                )
                                : null}
                            <div style={rowStyle}>
                                <span style={{ fontSize: '10px', color: COLORS.dim }}>output</span>
                                <button
                                    type='button'
                                    onClick={() => { toggleCapture(node.id) }}
                                    style={capturing ? activeButtonStyle : buttonStyle}
                                >
                                    {capturing ? 'capturing' : 'capture'}
                                </button>
                            </div>
                            {capturing
                                ? (
                                    unreadable
                                        ? <div style={placeholderStyle}>{unreadable}</div>
                                        : (
                                            <canvas
                                                ref={el => {
                                                    if (el) {
                                                        canvasRefs.current.set(node.id, el);
                                                    } else {
                                                        canvasRefs.current.delete(node.id);
                                                    }
                                                }}
                                                width={THUMBNAIL_WIDTH}
                                                height={THUMBNAIL_HEIGHT}
                                                style={thumbnailCanvasStyle}
                                            />
                                        )
                                )
                                : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
