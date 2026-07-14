import { useState } from 'react';

import { Grain } from '../../src/effects/Grain/Grain';
import { MeshGradient } from '../../src/effects/MeshGradient/MeshGradient';
import { useAudioUniforms } from '../../src/react/hooks/useAudioUniforms';

const MIC = { type: 'mic' } as const;

const panelStyle = {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    padding: '14px 16px',
    background: 'rgba(0, 0, 0, 0.62)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '6px',
    maxWidth: 'calc(100vw - 24px)'
} as const;

const columnStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '180px'
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
            <span style={{ width: '40px', textAlign: 'right' }}>{value.toFixed(2)}</span>
        </span>
    </label>
);

export const EffectsGallery = () => {
    const [poster, setPoster] = useState(false);
    const [meshSpeed, setMeshSpeed] = useState(0.2);
    const [warp, setWarp] = useState(0.6);
    const [warpScale, setWarpScale] = useState(1.2);
    const [seed, setSeed] = useState(0);
    const [grainSpeed, setGrainSpeed] = useState(1);
    const [intensity, setIntensity] = useState(0.08);
    const [scale, setScale] = useState(2);
    const [audioStrength, setAudioStrength] = useState(1);

    const audio = useAudioUniforms(MIC, { attack: 0.05, release: 0.25 });
    const running = audio.status === 'running';

    const half = { position: 'relative', flex: '1 1 0', minWidth: 0 } as const;

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
            <div style={half}>
                <MeshGradient
                    speed={poster ? 0 : meshSpeed}
                    warp={warp}
                    warpScale={warpScale}
                    seed={seed}
                    audio={audio}
                    audioStrength={audioStrength}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                    fit='element'
                />
            </div>
            <div style={half}>
                <Grain
                    color={[0.02, 0.02, 0.04]}
                    grainColor={[0.95, 0.95, 1]}
                    intensity={intensity}
                    scale={scale}
                    speed={poster ? 0 : grainSpeed}
                    audio={audio}
                    audioStrength={audioStrength}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                    fit='element'
                />
            </div>

            <div style={panelStyle}>
                <div style={columnStyle}>
                    <strong>MeshGradient</strong>
                    <Knob label='speed' value={meshSpeed} min={0} max={2} step={0.05} onChange={setMeshSpeed} />
                    <Knob label='warp' value={warp} min={0} max={2} step={0.05} onChange={setWarp} />
                    <Knob label='warpScale' value={warpScale} min={0.2} max={4} step={0.1} onChange={setWarpScale} />
                    <Knob label='seed' value={seed} min={0} max={12} step={1} onChange={setSeed} />
                </div>
                <div style={columnStyle}>
                    <strong>Grain</strong>
                    <Knob label='intensity' value={intensity} min={0} max={1} step={0.01} onChange={setIntensity} />
                    <Knob label='scale' value={scale} min={1} max={8} step={0.5} onChange={setScale} />
                    <Knob label='speed' value={grainSpeed} min={0} max={4} step={0.1} onChange={setGrainSpeed} />
                </div>
                <div style={columnStyle}>
                    <strong>Shared</strong>
                    <button type='button' style={buttonStyle(poster)} onClick={() => { setPoster(value => !value) }}>
                        {poster ? 'poster: speed=0' : 'poster: off'}
                    </button>
                    <button
                        type='button'
                        style={buttonStyle(running)}
                        onClick={() => {
                            if (running) {
                                audio.stop();
                            } else {
                                void audio.start();
                            }
                        }}
                    >
                        {running ? 'audio: stop' : 'audio: start (mic)'}
                    </button>
                    <Knob
                        label='audioStrength'
                        value={audioStrength}
                        min={0}
                        max={4}
                        step={0.1}
                        onChange={setAudioStrength}
                    />
                    <div>status: {audio.status}</div>
                    {audio.error ? <div style={{ color: '#ff8fa3' }}>{audio.error.message}</div> : null}
                </div>
            </div>
        </div>
    );
};
