import type { ReactElement, RefObject } from 'react';

import type { FrameStats } from '@/react/devtools/lib/frameStats';
import { fpsFromMean } from '@/react/devtools/lib/frameStats';
import { COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';

interface FpsPanelProps {
    stats: FrameStats;
    canvasRef: RefObject<HTMLCanvasElement | null>;
}

export const FpsPanel = ({ stats, canvasRef }: FpsPanelProps): ReactElement => {
    const fps = Math.round(fpsFromMean(stats.mean));
    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>frame timing</div>
            <div style={rowStyle}>
                <span style={{ fontSize: '20px', fontWeight: 600, color: COLORS.good }}>
                    {fps} fps
                </span>
                <span style={{ fontSize: '10px', color: COLORS.dim, textAlign: 'right' }}>
                    mean {stats.mean.toFixed(1)}ms<br />
                    p50 {stats.p50.toFixed(1)} · p95 {stats.p95.toFixed(1)}
                </span>
            </div>
            <canvas
                ref={canvasRef}
                width={220}
                height={32}
                style={{ width: '100%', height: '32px', display: 'block', background: 'rgba(0,0,0,0.25)', borderRadius: '3px' }}
            />
        </div>
    );
};
