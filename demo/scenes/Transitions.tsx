import { useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec3 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useReducedMotion } from '../../src/react/hooks/useReducedMotion';
import type { UniformParam } from '../../src/types';
import { QUAD_VERTEX, TRANSITION_FRAGMENT } from './shaders';

interface Palette {
    name: string;
    colorStart: [number, number, number];
    colorEnd: [number, number, number];
    swirl: number;
}

const PALETTES: Palette[] = [
    { name: 'Sunset', colorStart: [0.95, 0.4, 0.2], colorEnd: [0.9, 0.75, 0.2], swirl: 4 },
    { name: 'Ocean', colorStart: [0.05, 0.2, 0.5], colorEnd: [0.1, 0.7, 0.75], swirl: 8 },
    { name: 'Forest', colorStart: [0.05, 0.3, 0.1], colorEnd: [0.6, 0.8, 0.2], swirl: 2 },
    { name: 'Mono', colorStart: [0.1, 0.1, 0.12], colorEnd: [0.85, 0.85, 0.9], swirl: 12 }
];

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: TRANSITION_FRAGMENT,
    uniformNames: {
        u_swirl: 'float',
        u_colorStart: 'vec3',
        u_colorEnd: 'vec3'
    }
});

export const Transitions = () => {
    const [paletteIndex, setPaletteIndex] = useState(0);
    const reducedMotionActive = useReducedMotion();
    const palette = PALETTES[paletteIndex];

    const uniforms: Record<string, UniformParam> = {
        swirl: { type: 'float', value: palette.swirl, transition: { duration: 600, easing: 'easeInOut' } },
        colorStart: {
            type: 'vec3',
            value: vec3(palette.colorStart),
            transition: { duration: 600, easing: 'easeInOut' }
        },
        colorEnd: {
            type: 'vec3',
            value: vec3(palette.colorEnd),
            transition: { duration: 600, easing: 'easeInOut' }
        }
    };

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BaseShaderComponent
                programId='transitions-demo'
                shaderConfig={config}
                uniforms={uniforms}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div
                style={{
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
                    maxWidth: '260px'
                }}
            >
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {PALETTES.map((entry, index) => (
                        <button
                            key={entry.name}
                            type='button'
                            onClick={() => { setPaletteIndex(index) }}
                            style={{
                                padding: '6px 10px',
                                background: index === paletteIndex ? '#e94560' : '#0f3460',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            {entry.name}
                        </button>
                    ))}
                </div>
                <div>
                    Click palettes fast to see mid-flight retargeting: each click starts a new 600ms
                    tween from wherever the current colors and swirl amount already are, not from the start.
                </div>
                <div>
                    useReducedMotion(): {String(reducedMotionActive)}
                    {reducedMotionActive
                        ? ' (OS reduced-motion is on, so transitions snap instantly instead of tweening.)'
                        : ''}
                </div>
            </div>
        </div>
    );
};
