import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { WebGLManager } from '@/core';
import { flipImageRows } from '@/react/devtools/lib/flipRows';
import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';

interface FramebuffersPanelProps {
    framebufferIds: string[];
    manager: WebGLManager | null;
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

export const FramebuffersPanel = ({ framebufferIds, manager, captureTick }: FramebuffersPanelProps): ReactElement | null => {
    const [captureOn, setCaptureOn] = useState<Record<string, boolean>>({});
    const [unreadableById, setUnreadableById] = useState<Record<string, string>>({});
    const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const scratchRef = useRef<HTMLCanvasElement | null>(null);
    const captureOnRef = useRef(captureOn);
    const framebufferIdsRef = useRef(framebufferIds);
    const managerRef = useRef(manager);

    useEffect(() => {
        captureOnRef.current = captureOn;
        framebufferIdsRef.current = framebufferIds;
        managerRef.current = manager;
    });

    useEffect(() => {
        const currentManager = managerRef.current;
        if (!currentManager) {
            return;
        }
        for (const id of framebufferIdsRef.current) {
            if (!captureOnRef.current[id]) {
                continue;
            }
            const result = currentManager.fbo.debugReadFramebuffer(id, CAPTURE_MAX_SIZE);
            if ('unreadable' in result) {
                setUnreadableById(prev => (prev[id] === result.unreadable ? prev : { ...prev, [id]: result.unreadable }));
                continue;
            }
            setUnreadableById(prev => {
                if (!(id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                Reflect.deleteProperty(next, id);
                return next;
            });
            const canvas = canvasRefs.current.get(id);
            if (!canvas) {
                continue;
            }
            const flipped = flipImageRows(result.pixels, result.width, result.height);
            let scratch = scratchRef.current;
            if (!scratch) {
                scratch = document.createElement('canvas');
                scratchRef.current = scratch;
            }
            scratch.width = result.width;
            scratch.height = result.height;
            const scratchCtx = scratch.getContext('2d');
            if (!scratchCtx) {
                continue;
            }
            scratchCtx.putImageData(new ImageData(flipped, result.width, result.height), 0, 0);
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                continue;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(scratch, 0, 0, result.width, result.height, 0, 0, canvas.width, canvas.height);
        }
    }, [captureTick]);

    if (framebufferIds.length === 0) {
        return null;
    }

    const toggle = (id: string): void => {
        setCaptureOn(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>framebuffers</div>
            <div style={{ fontSize: '10px', color: COLORS.warn }}>
                capture stalls the GPU pipeline — perturbs timing
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {framebufferIds.map(id => (
                    <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={rowStyle}>
                            <span style={{ fontSize: '11px', color: COLORS.dim }}>{id}</span>
                            <button
                                type='button'
                                onClick={() => { toggle(id) }}
                                style={captureOn[id] ? activeButtonStyle : buttonStyle}
                            >
                                {captureOn[id] ? 'capturing' : 'capture'}
                            </button>
                        </div>
                        {captureOn[id]
                            ? (
                                unreadableById[id]
                                    ? <div style={placeholderStyle}>{unreadableById[id]}</div>
                                    : (
                                        <canvas
                                            ref={el => {
                                                if (el) {
                                                    canvasRefs.current.set(id, el);
                                                } else {
                                                    canvasRefs.current.delete(id);
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
                ))}
            </div>
        </div>
    );
};
