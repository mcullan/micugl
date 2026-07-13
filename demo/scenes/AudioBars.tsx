import { useState } from 'react';

import { audioBarsFragmentShader, audioBarsVertexShader } from '../../examples/AudioBars/audioBarsShaders';
import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec3 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useAudioUniforms } from '../../src/react/hooks/useAudioUniforms';
import type { AudioSourceSpec, Frameloop } from '../../src/types';

const config = createShaderConfig({
    vertexShader: audioBarsVertexShader,
    fragmentShader: audioBarsFragmentShader,
    uniformNames: {
        u_audioBands: 'vec4',
        u_audioLevel: 'float',
        u_colorLow: 'vec3',
        u_colorHigh: 'vec3'
    }
});

const panelStyle = {
    position: 'absolute',
    top: '12px',
    left: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '4px',
    maxWidth: '320px'
} as const;

const buttonStyle = (active: boolean) => ({
    padding: '6px 10px',
    background: active ? '#e94560' : '#0f3460',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer'
});

interface VisualizerProps {
    source: AudioSourceSpec;
    frameloop: Frameloop;
    onStart: () => void;
}

const Visualizer = ({ source, frameloop, onStart }: VisualizerProps) => {
    const audio = useAudioUniforms(source, { bands: 4, attack: 0.01, release: 0.18 });

    return (
        <>
            <BaseShaderComponent
                programId='audio-bars-demo'
                shaderConfig={config}
                uniforms={{
                    ...audio.uniforms,
                    u_colorLow: { type: 'vec3', value: vec3([0.15, 0.45, 0.95]) },
                    u_colorHigh: { type: 'vec3', value: vec3([0.95, 0.25, 0.45]) }
                }}
                frameloop={frameloop}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div style={panelStyle}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type='button'
                        style={buttonStyle(audio.status === 'running')}
                        onClick={() => {
                            onStart();
                            void audio.start();
                        }}
                    >
                        start
                    </button>
                    <button
                        type='button'
                        style={buttonStyle(audio.status !== 'running')}
                        onClick={audio.stop}
                    >
                        stop
                    </button>
                </div>
                <div>source: {source.type}</div>
                <div>status: {audio.status}</div>
                <div>frameloop: {frameloop}</div>
                {audio.error ? <div style={{ color: '#ff8fa3' }}>{audio.error.message}</div> : null}
                <div>
                    The bands and the level are ordinary function-valued uniforms, sampled once per rendered
                    frame. Under frameloop &quot;demand&quot; the driver invalidates the engine every time it
                    analyses, so the loop keeps itself alive while audio is running and goes idle the moment
                    you stop it.
                </div>
            </div>
        </>
    );
};

export const AudioBars = () => {
    const [element, setElement] = useState<HTMLAudioElement | null>(null);
    const [mode, setMode] = useState<'element' | 'mic'>('element');
    const [frameloop, setFrameloop] = useState<Frameloop>('demand');
    const [trackUrl, setTrackUrl] = useState<string | null>(null);

    const source: AudioSourceSpec | null = mode === 'mic'
        ? { type: 'mic' }
        : (element ? { type: 'element', element } : null);

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            {source
                ? (
                    <Visualizer
                        key={mode}
                        source={source}
                        frameloop={frameloop}
                        onStart={() => {
                            if (mode === 'element') {
                                void element?.play();
                            }
                        }}
                    />
                )
                : null}
            <div style={{ ...panelStyle, top: 'auto', bottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['element', 'mic'] as const).map(entry => (
                        <button
                            key={entry}
                            type='button'
                            style={buttonStyle(mode === entry)}
                            onClick={() => { setMode(entry) }}
                        >
                            {entry}
                        </button>
                    ))}
                    {(['demand', 'always'] as const).map(entry => (
                        <button
                            key={entry}
                            type='button'
                            style={buttonStyle(frameloop === entry)}
                            onClick={() => { setFrameloop(entry) }}
                        >
                            {entry}
                        </button>
                    ))}
                </div>
                <input
                    type='file'
                    accept='audio/*'
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                            setTrackUrl(previous => {
                                if (previous) {
                                    URL.revokeObjectURL(previous);
                                }
                                return URL.createObjectURL(file);
                            });
                        }
                    }}
                />
                <audio ref={setElement} src={trackUrl ?? undefined} controls loop />
                <div>
                    Swapping the source remounts the visualizer (the hook owns one audio graph for its whole
                    life and throws if the source changes under it), so the old graph is stopped first.
                </div>
            </div>
        </div>
    );
};
