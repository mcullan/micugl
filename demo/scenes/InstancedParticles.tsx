import { useMemo, useRef } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseInstancedShaderComponent } from '../../src/react/components/base/BaseInstancedShaderComponent';
import type { InstanceAttribute, UniformParam } from '../../src/types';
import { getIntQuery } from './query';
import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './shaders';

const config = createShaderConfig({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    attributeConfigs: [
        { name: 'a_offset', size: 2, type: 'FLOAT', instanced: true },
        { name: 'a_color', size: 3, type: 'FLOAT', instanced: true }
    ]
});

const uniforms: Record<string, UniformParam> = {};

const buildColors = (count: number): Float32Array => {
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const hue = i / count;
        colors[i * 3] = hue;
        colors[i * 3 + 1] = 1 - hue;
        colors[i * 3 + 2] = 0.5;
    }
    return colors;
};

export const InstancedParticles = () => {
    const count = getIntQuery('count', 10000);
    const offsetsRef = useRef<Float32Array | null>(null);
    const colors = useMemo(() => buildColors(count), [count]);

    const instanceAttributes: Record<string, InstanceAttribute> = useMemo(() => ({
        a_offset: {
            data: () => {
                if (!offsetsRef.current || offsetsRef.current.length !== count * 2) {
                    offsetsRef.current = new Float32Array(count * 2);
                }
                const offsets = offsetsRef.current;
                const t = performance.now() * 0.001;
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2 + t;
                    const radius = 0.2 + 0.6 * ((i % 7) / 7);
                    offsets[i * 2] = Math.cos(angle) * radius;
                    offsets[i * 2 + 1] = Math.sin(angle) * radius;
                }
                return offsets;
            },
            size: 2,
            usage: 'dynamic'
        },
        a_color: {
            data: colors,
            size: 3,
            usage: 'static'
        }
    }), [count, colors]);

    return (
        <BaseInstancedShaderComponent
            programId='instanced-particles'
            shaderConfig={config}
            uniforms={uniforms}
            instanceCount={count}
            instanceAttributes={instanceAttributes}
            style={{ width: '100vw', height: '100vh', display: 'block' }}
        />
    );
};
