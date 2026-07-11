import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { DevtoolsSink, EngineDebugState, EngineHandle } from '@/react/devtools/beacon';
import { setDevtoolsSink } from '@/react/devtools/beacon';
import { isEngineStateUnavailable } from '@/react/devtools/lib/engineState';
import type { FrameStats } from '@/react/devtools/lib/frameStats';
import { computeFrameStats, fpsFromMean, pushCapped } from '@/react/devtools/lib/frameStats';
import { buttonStyle, COLORS, FONT, sectionStyle } from '@/react/devtools/lib/theme';
import { CapabilitiesPanel } from '@/react/devtools/panels/CapabilitiesPanel';
import { FpsPanel } from '@/react/devtools/panels/FpsPanel';
import { FrameloopPanel } from '@/react/devtools/panels/FrameloopPanel';
import { GlCountersPanel } from '@/react/devtools/panels/GlCountersPanel';
import { diffCounters } from '@/testing/assertions';
import type { GlCountersData, GlCountersHandle } from '@/testing/glCounters';
import { installGlCounters } from '@/testing/glCounters';
import type { Frameloop } from '@/types';

export type DevtoolsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MicuglDevtoolsProps {
    position?: DevtoolsPosition;
    defaultOpen?: boolean;
}

const MAX_SAMPLES = 180;
const THROTTLE_MS = 100;

let panelActive = false;

const positionStyle = (position: DevtoolsPosition): CSSProperties => {
    const style: CSSProperties = {
        position: 'fixed',
        zIndex: 2147483647,
        margin: '8px',
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.text,
        lineHeight: 1.4
    };
    if (position === 'top-left' || position === 'top-right') {
        style.top = 0;
    } else {
        style.bottom = 0;
    }
    if (position === 'top-left' || position === 'bottom-left') {
        style.left = 0;
    } else {
        style.right = 0;
    }
    return style;
};

const panelStyle: CSSProperties = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
    overflow: 'hidden'
};

const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px'
};

const collapsedButtonStyle: CSSProperties = {
    ...buttonStyle,
    fontSize: '11px',
    padding: '5px 10px',
    borderRadius: '6px',
    background: COLORS.bg,
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
};

const warningBadgeStyle: CSSProperties = {
    fontSize: '11px',
    color: '#0b0d16',
    background: COLORS.warn,
    borderRadius: '4px',
    padding: '4px 6px',
    fontWeight: 600
};

const selectStyle: CSSProperties = {
    width: '100%',
    fontFamily: FONT,
    fontSize: '11px',
    padding: '3px 6px',
    background: 'rgba(0,0,0,0.3)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px',
    color: COLORS.text
};

const drawSparkline = (
    canvas: HTMLCanvasElement | null,
    values: readonly number[],
    color: string
): void => {
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (values.length === 0) {
        return;
    }
    let peak = 0;
    for (const value of values) {
        if (value > peak) {
            peak = value;
        }
    }
    if (peak <= 0) {
        peak = 1;
    }
    const span = values.length > 1 ? values.length - 1 : 1;
    ctx.beginPath();
    values.forEach((value, index) => {
        const x = (index / span) * width;
        const y = height - (value / peak) * height;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
};

interface DevtoolsPanelProps {
    position: DevtoolsPosition;
    defaultOpen: boolean;
}

const DevtoolsPanel = ({ position, defaultOpen }: DevtoolsPanelProps): ReactElement => {
    const [open, setOpen] = useState(defaultOpen);
    const [engines, setEngines] = useState<EngineHandle[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [fpsStats, setFpsStats] = useState<FrameStats>({ count: 0, mean: 0, p50: 0, p95: 0 });
    const [engineState, setEngineState] = useState<EngineDebugState | null>(null);
    const [liveFrame, setLiveFrame] = useState(0);
    const [glOn, setGlOn] = useState(false);
    const [glDelta, setGlDelta] = useState<GlCountersData | null>(null);

    const selected = engines.find(engine => engine.id === selectedId) ?? engines.at(0) ?? null;

    const fpsCanvasRef: RefObject<HTMLCanvasElement | null> = useRef<HTMLCanvasElement | null>(null);
    const glCanvasRef: RefObject<HTMLCanvasElement | null> = useRef<HTMLCanvasElement | null>(null);
    const frameDeltasRef = useRef<number[]>([]);
    const glHistoryRef = useRef<number[]>([]);
    const lastTsRef = useRef(0);
    const lastThrottleRef = useRef(0);
    const glCountersRef = useRef<GlCountersHandle | null>(null);
    const latestGlRef = useRef<GlCountersData | null>(null);
    const prevGlRef = useRef<GlCountersData | null>(null);

    const openRef = useRef(open);
    const glOnRef = useRef(glOn);
    const selectedRef = useRef<EngineHandle | null>(selected);
    useEffect(() => {
        openRef.current = open;
        glOnRef.current = glOn;
        selectedRef.current = selected;
    });

    useEffect(() => {
        const sink: DevtoolsSink = {
            onMount: handle => { setEngines(prev => [...prev.filter(engine => engine.id !== handle.id), handle]) },
            onUnmount: id => { setEngines(prev => prev.filter(engine => engine.id !== id)) }
        };
        setDevtoolsSink(null);
        setDevtoolsSink(sink);
        return () => { setDevtoolsSink(null) };
    }, []);

    useEffect(() => {
        let raf = 0;
        const loop = (timestamp: number): void => {
            raf = requestAnimationFrame(loop);
            const last = lastTsRef.current;
            lastTsRef.current = timestamp;
            if (last !== 0) {
                pushCapped(frameDeltasRef.current, timestamp - last, MAX_SAMPLES);
            }
            const opened = openRef.current;
            if (opened) {
                drawSparkline(fpsCanvasRef.current, frameDeltasRef.current, COLORS.good);
                const counters = glCountersRef.current;
                if (glOnRef.current && counters) {
                    const snap = counters.snapshot();
                    const prev = prevGlRef.current;
                    prevGlRef.current = snap;
                    if (prev) {
                        const delta = diffCounters(prev, snap);
                        latestGlRef.current = delta;
                        pushCapped(glHistoryRef.current, delta.drawArrays + delta.drawElements, MAX_SAMPLES);
                        drawSparkline(glCanvasRef.current, glHistoryRef.current, COLORS.accent);
                    }
                }
            }
            if (timestamp - lastThrottleRef.current >= THROTTLE_MS) {
                lastThrottleRef.current = timestamp;
                setFpsStats(computeFrameStats(frameDeltasRef.current));
                if (opened) {
                    const handle = selectedRef.current;
                    if (handle) {
                        setEngineState(handle.getState());
                        if (handle.getFrame) {
                            setLiveFrame(handle.getFrame());
                        }
                    }
                    if (glOnRef.current) {
                        setGlDelta(latestGlRef.current);
                    }
                }
            }
        };
        raf = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(raf) };
    }, []);

    const handleToggleGl = useCallback(() => {
        const next = !glOnRef.current;
        if (next) {
            const counters = glCountersRef.current ?? installGlCounters();
            glCountersRef.current = counters;
            prevGlRef.current = counters.snapshot();
            glHistoryRef.current.length = 0;
        } else {
            setGlDelta(null);
        }
        setGlOn(next);
    }, []);

    const handleInvalidate = useCallback(() => { selectedRef.current?.invalidate?.() }, []);
    const handleSetFrameloop = useCallback((mode: Frameloop) => {
        selectedRef.current?.setFrameloop?.(mode);
        selectedRef.current?.invalidate?.();
    }, []);
    const handleStep = useCallback((delta: number) => {
        const handle = selectedRef.current;
        if (handle?.setFrame && handle.getFrame) {
            handle.setFrame(handle.getFrame() + delta);
        }
    }, []);
    const handleSetFrame = useCallback((frame: number) => { selectedRef.current?.setFrame?.(frame) }, []);

    if (!open) {
        return (
            <div style={positionStyle(position)}>
                <button type='button' onClick={() => { setOpen(true) }} style={collapsedButtonStyle}>
                    micugl · {Math.round(fpsFromMean(fpsStats.mean))} fps
                </button>
            </div>
        );
    }

    const unavailable = engineState !== null && isEngineStateUnavailable(engineState);

    return (
        <div style={{ ...positionStyle(position), width: '240px' }}>
            <div style={panelStyle}>
                <div style={headerStyle}>
                    <span style={{ fontWeight: 600 }}>micugl devtools</span>
                    <button type='button' onClick={() => { setOpen(false) }} style={buttonStyle}>collapse</button>
                </div>
                {engines.length === 0
                    ? <div style={{ padding: '10px', color: COLORS.dim, fontSize: '11px' }}>no micugl engines mounted</div>
                    : (
                        <>
                            {engines.length > 1
                                ? (
                                    <div style={sectionStyle}>
                                        <select
                                            value={selected?.id ?? ''}
                                            onChange={event => { setSelectedId(event.target.value) }}
                                            style={selectStyle}
                                        >
                                            {engines.map(engine => (
                                                <option key={engine.id} value={engine.id}>
                                                    {engine.kind} · {engine.id.slice(0, 8)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )
                                : null}
                            {unavailable
                                ? <div style={sectionStyle}><div style={warningBadgeStyle}>engine state unavailable</div></div>
                                : null}
                            <FpsPanel stats={fpsStats} canvasRef={fpsCanvasRef} />
                            {engineState
                                ? (
                                    <>
                                        <CapabilitiesPanel
                                            capabilities={engineState.capabilities}
                                            floatFilterDowngraded={engineState.floatFilterDowngraded}
                                        />
                                        <FrameloopPanel
                                            frameloop={engineState.frameloop}
                                            paused={engineState.paused}
                                            speed={engineState.speed}
                                            frame={liveFrame}
                                            onInvalidate={handleInvalidate}
                                            onSetFrameloop={handleSetFrameloop}
                                            onStep={handleStep}
                                            onSetFrame={handleSetFrame}
                                        />
                                    </>
                                )
                                : null}
                            <GlCountersPanel on={glOn} onToggle={handleToggleGl} delta={glDelta} canvasRef={glCanvasRef} />
                        </>
                    )}
            </div>
        </div>
    );
};

const MicuglDevtoolsComponent = ({ position = 'bottom-right', defaultOpen = false }: MicuglDevtoolsProps): ReactNode => {
    const [mount, setMount] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (typeof document === 'undefined' || panelActive) {
            return;
        }
        panelActive = true;

        const host = document.createElement('div');
        host.setAttribute('data-micugl-devtools', '');
        const shadow = host.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        shadow.appendChild(container);
        document.body.appendChild(host);
        setMount(container);

        return () => {
            panelActive = false;
            setMount(null);
            host.remove();
        };
    }, []);

    if (!mount) {
        return null;
    }
    return createPortal(<DevtoolsPanel position={position} defaultOpen={defaultOpen} />, mount);
};

export const MicuglDevtools = memo(MicuglDevtoolsComponent);
