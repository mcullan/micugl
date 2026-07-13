import type { CSSProperties } from 'react';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { vec3 } from '@/core/lib/vectorUtils';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import { useAudioUniforms } from '@/react/hooks/useAudioUniforms';
import type { AudioSourceSpec, Frameloop } from '@/types';

import { audioBarsFragmentShader, audioBarsVertexShader } from './audioBarsShaders';

type Vec3 = [number, number, number];

const COLOR_LOW: Vec3 = [0.15, 0.45, 0.95];
const COLOR_HIGH: Vec3 = [0.95, 0.25, 0.45];

const shaderConfig = createShaderConfig({
    vertexShader: audioBarsVertexShader,
    fragmentShader: audioBarsFragmentShader,
    uniformNames: {
        u_audioBands: 'vec4',
        u_audioLevel: 'float',
        u_colorLow: 'vec3',
        u_colorHigh: 'vec3'
    }
});

export interface AudioBarsProps {
    source: AudioSourceSpec;
    attack?: number;
    release?: number;
    colorLow?: Vec3;
    colorHigh?: Vec3;
    frameloop?: Frameloop;
    className?: string;
    style?: CSSProperties;
}

export const AudioBars = ({
    source,
    attack = 0.01,
    release = 0.18,
    colorLow = COLOR_LOW,
    colorHigh = COLOR_HIGH,
    frameloop = 'demand',
    className = '',
    style
}: AudioBarsProps) => {
    const audio = useAudioUniforms(source, { bands: 4, attack, release });

    return (
        <>
            <BaseShaderComponent
                programId='audio-bars'
                shaderConfig={shaderConfig}
                uniforms={{
                    ...audio.uniforms,
                    u_colorLow: { type: 'vec3', value: vec3(colorLow) },
                    u_colorHigh: { type: 'vec3', value: vec3(colorHigh) }
                }}
                frameloop={frameloop}
                className={className}
                style={style}
            />
            {audio.status === 'running'
                ? <button type='button' onClick={audio.stop}>stop</button>
                : <button type='button' onClick={() => { void audio.start() }}>start</button>}
            {audio.error && <p role='alert'>{audio.error.message}</p>}
        </>
    );
};

export default AudioBars;
