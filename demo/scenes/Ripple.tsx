import { useState } from 'react';

import { Ripple } from '../../src/effects/Ripple/Ripple';
import { useAudioUniforms } from '../../src/react/hooks/useAudioUniforms';

const MIC = { type: 'mic' } as const;

const panelStyle = {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px 16px',
    background: 'rgba(0, 0, 0, 0.62)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '6px',
    minWidth: '220px'
} as const;

const buttonStyle = (active: boolean) => ({
    padding: '6px 10px',
    background: active ? '#e94560' : '#0f3460',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer'
});

interface KnobProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}

const Knob = ({ label, value, min, max, step, onChange }: KnobProps) => (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
        <span>{label}</span>
        <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
                type='range'
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={event => { onChange(Number(event.target.value)) }}
            />
            <span style={{ width: '48px', textAlign: 'right' }}>{value.toFixed(step < 1 ? 3 : 0)}</span>
        </span>
    </label>
);

export const RippleScene = () => {
    const [damping, setDamping] = useState(0.99);
    const [mouseForce, setMouseForce] = useState(0.5);
    const [iterations, setIterations] = useState(2);
    const [audioStrength, setAudioStrength] = useState(1);

    const audio = useAudioUniforms(MIC, { attack: 0.05, release: 0.25 });
    const running = audio.status === 'running';
    const starting = audio.status === 'starting';

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <Ripple
                damping={damping}
                mouseForce={mouseForce}
                iterations={iterations}
                audio={running ? audio : undefined}
                audioStrength={audioStrength}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div style={panelStyle}>
                <strong>Ripple</strong>
                <Knob label='damping' value={damping} min={0.9} max={0.999} step={0.001} onChange={setDamping} />
                <Knob label='mouseForce' value={mouseForce} min={0} max={1} step={0.05} onChange={setMouseForce} />
                <Knob label='iterations' value={iterations} min={1} max={8} step={1} onChange={setIterations} />
                <Knob
                    label='audioStrength'
                    value={audioStrength}
                    min={0}
                    max={4}
                    step={0.1}
                    onChange={setAudioStrength}
                />
                <button
                    type='button'
                    style={{ ...buttonStyle(running), opacity: starting ? 0.5 : 1 }}
                    disabled={starting}
                    onClick={() => {
                        if (running) {
                            audio.stop();
                        } else {
                            void audio.start();
                        }
                    }}
                >
                    {starting ? 'audio: starting' : running ? 'audio: stop' : 'audio: start (mic)'}
                </button>
                <div>status: {audio.status}</div>
                <div style={{ opacity: 0.7 }}>drag on the canvas to drop ripples</div>
                {audio.error ? <div style={{ color: '#ff8fa3' }}>{audio.error.message}</div> : null}
            </div>
        </div>
    );
};
