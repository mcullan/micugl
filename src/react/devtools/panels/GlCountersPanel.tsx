import type { ReactElement, RefObject } from 'react';

import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';
import type { GlCountersData } from '@/testing/glCounters';

interface GlCountersPanelProps {
    on: boolean;
    onToggle: () => void;
    delta: GlCountersData | null;
    canvasRef: RefObject<HTMLCanvasElement | null>;
}

const counterRow = (label: string, value: number): ReactElement => (
    <div key={label} style={rowStyle}>
        <span style={{ color: COLORS.dim }}>{label}</span>
        <span>{value}</span>
    </div>
);

export const GlCountersPanel = ({ on, onToggle, delta, canvasRef }: GlCountersPanelProps): ReactElement => {
    return (
        <div style={sectionStyle}>
            <div style={rowStyle}>
                <span style={sectionTitleStyle}>gl calls / frame</span>
                <button type='button' onClick={onToggle} style={on ? activeButtonStyle : buttonStyle}>
                    {on ? 'on' : 'off'}
                </button>
            </div>
            <div style={{ fontSize: '10px', color: COLORS.warn }}>
                measures all contexts; wrapping adds per-call overhead while on
            </div>
            {on && delta
                ? (
                    <>
                        <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {counterRow('draws', delta.drawArrays + delta.drawElements)}
                            {counterRow('uniform uploads', delta.uniformCalls)}
                            {counterRow('texImage2D', delta.texImage2D)}
                            {counterRow('compiles', delta.compileShader + delta.linkProgram)}
                        </div>
                        <canvas
                            ref={canvasRef}
                            width={220}
                            height={28}
                            style={{ width: '100%', height: '28px', display: 'block', background: 'rgba(0,0,0,0.25)', borderRadius: '3px' }}
                        />
                    </>
                )
                : null}
        </div>
    );
};
