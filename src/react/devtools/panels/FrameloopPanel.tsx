import type { ReactElement } from 'react';

import { NumberField } from '@/react/devtools/controls/NumberField';
import { stepForType } from '@/react/devtools/lib/step';
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
                    {paused === true ? 'paused' : 'running'} {'\u00b7'} {(speed ?? 1).toFixed(2)}x
                </span>
            </div>
            <div style={rowStyle}>
                <span style={{ color: COLORS.dim }}>frame</span>
                <div style={{ width: '96px' }}>
                    <NumberField
                        value={frame}
                        step={stepForType('int', frame)}
                        ariaLabel='frame'
                        onChange={onSetFrame}
                    />
                </div>
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
        </div>
    );
};
