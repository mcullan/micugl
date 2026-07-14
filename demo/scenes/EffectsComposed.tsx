import { useState } from 'react';

import { blurNode } from '../../src/effects/Blur/blurNode';
import { ditherNode } from '../../src/effects/Dither/ditherNode';
import { grainNode } from '../../src/effects/Grain/grainNode';
import { meshGradientNode } from '../../src/effects/MeshGradient/meshGradientNode';
import { ShaderGraph } from '../../src/react/components/ShaderGraph';
import { MicuglDevtools } from '../../src/react/devtools/MicuglDevtools';

const overlayStyle = {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '4px',
    lineHeight: 1.6
} as const;

export const EffectsComposed = () => {
    const [levels, setLevels] = useState(3);
    const [radius, setRadius] = useState(24);

    const gradient = meshGradientNode({
        id: 'gradient',
        speed: 0.4,
        warp: 0.8,
        colors: [[0.10, 0.12, 0.35], [0.95, 0.55, 0.25], [0.20, 0.75, 0.85]],
        width: 512,
        height: 512
    });

    const blurred = blurNode({
        id: 'blurred',
        src: gradient,
        radius,
        width: 512,
        height: 512
    });

    const root = ditherNode({
        id: 'dithered',
        src: blurred,
        levels,
        matrixLevels: 3,
        scale: 2
    });

    const grain = grainNode({
        id: 'grain-corner',
        color: [0.02, 0.02, 0.04],
        grainColor: [0.95, 0.95, 1.0],
        intensity: 0.5,
        scale: 2,
        speed: 1
    });

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
            <ShaderGraph
                root={root}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div style={{ position: 'absolute', right: '12px', bottom: '12px', width: '180px', height: '120px', border: '1px solid #333' }}>
                <ShaderGraph
                    root={grain}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                />
            </div>
            <div style={overlayStyle}>
                <div>gradient 512x512 -&gt; blur (one program, two passes) -&gt; dither to canvas</div>
                <div>grain generator in the corner (fourth factory)</div>
                <button
                    type='button'
                    onClick={() => { setLevels(current => (current >= 5 ? 2 : current + 1)) }}
                    style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                >
                    dither levels (now {levels})
                </button>
                <button
                    type='button'
                    onClick={() => { setRadius(current => (current >= 40 ? 0 : current + 16)) }}
                    style={{ marginTop: '6px', marginLeft: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                >
                    blur radius (now {radius})
                </button>
            </div>
            <MicuglDevtools defaultOpen />
        </div>
    );
};
