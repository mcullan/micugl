import type { ReactElement } from 'react';
import { useState } from 'react';

import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';
import type { Frameloop } from '@/types';

interface FrameloopPanelProps {
    frameloop?: Frameloop;
    paused?: boolean;
    speed?: number;
    frame: number;
    onInvalidate: () => void;
    onSetFrameloop: (mode: Frameloop) => void;
    onStep: (delta: number) => void;
    onSetFrame: (frame: number) => void;
}

const MODES: Frameloop[] = ['always', 'demand', 'never'];
const STEPS = [-10, -1, 1, 10];

export const FrameloopPanel = ({
    frameloop,
    paused,
    speed,
    frame,
    onInvalidate,
    onSetFrameloop,
    onStep,
    onSetFrame
}: FrameloopPanelProps): ReactElement => {
    const [draft, setDraft] = useState('');

    const applyDraft = (): void => {
        const parsed = Number.parseInt(draft, 10);
        if (!Number.isNaN(parsed)) {
            onSetFrame(parsed);
        }
        setDraft('');
    };

    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>frameloop</div>
            <div style={rowStyle}>
                <span style={{ color: COLORS.dim }}>mode</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {MODES.map(mode => (
                        <button
                            key={mode}
                            type='button'
                            onClick={() => { onSetFrameloop(mode) }}
                            style={frameloop === mode ? activeButtonStyle : buttonStyle}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>
            <div style={rowStyle}>
                <span style={{ color: COLORS.dim }}>state</span>
                <span style={{ color: paused === true ? COLORS.warn : COLORS.good }}>
                    {paused === true ? 'paused' : 'running'} · {(speed ?? 1).toFixed(2)}x
                </span>
            </div>
            <div style={rowStyle}>
                <span style={{ color: COLORS.dim }}>frame</span>
                <span>{frame}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button type='button' onClick={onInvalidate} style={buttonStyle}>invalidate</button>
                {STEPS.map(step => (
                    <button
                        key={step}
                        type='button'
                        onClick={() => { onStep(step) }}
                        style={buttonStyle}
                    >
                        {step > 0 ? `+${String(step)}` : String(step)}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
                <input
                    type='number'
                    value={draft}
                    placeholder='jump to frame'
                    onChange={e => { setDraft(e.target.value) }}
                    onKeyDown={e => { if (e.key === 'Enter') { applyDraft() } }}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        padding: '3px 6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: '4px',
                        color: COLORS.text
                    }}
                />
                <button type='button' onClick={applyDraft} style={buttonStyle}>set</button>
            </div>
        </div>
    );
};
