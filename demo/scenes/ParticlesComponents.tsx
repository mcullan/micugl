import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec2 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import { getIntQuery } from './query';
import { PARTICLES_COMPONENT_FRAGMENT, QUAD_VERTEX } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: PARTICLES_COMPONENT_FRAGMENT,
    uniformNames: {
        u_offset0: 'vec2',
        u_offset1: 'vec2',
        u_offset2: 'vec2'
    }
});

const buildUniforms = (index: number): Record<string, UniformParam> => ({
    u_offset0: {
        type: 'vec2',
        value: (time = 0) => vec2([0.5 * Math.cos(time * 0.001 + index), 0.5 * Math.sin(time * 0.001 + index)])
    },
    u_offset1: {
        type: 'vec2',
        value: (time = 0) => vec2([
            0.5 * Math.cos(time * 0.001 + index + 2),
            0.5 * Math.sin(time * 0.001 + index + 2)
        ])
    },
    u_offset2: {
        type: 'vec2',
        value: (time = 0) => vec2([
            0.5 * Math.cos(time * 0.001 + index + 4),
            0.5 * Math.sin(time * 0.001 + index + 4)
        ])
    }
});

export const ParticlesComponents = () => {
    const n = getIntQuery('n', 12);
    const cells = Array.from({ length: n }, (_, index) => index);

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                padding: '8px',
                width: '100vw',
                height: '100vh'
            }}
        >
            {cells.map(index => (
                <div key={index} style={{ width: '100%', height: '100%', minHeight: '0' }}>
                    <BaseShaderComponent
                        programId={`particles-comp-${String(index)}`}
                        shaderConfig={config}
                        uniforms={buildUniforms(index)}
                        width={160}
                        height={160}
                        pixelRatio={1}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                </div>
            ))}
        </div>
    );
};
