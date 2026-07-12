import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec2, vec3 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import { QUAD_VERTEX } from './shaders';

const DEVTOOLS_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_speed;
    uniform float u_scale;
    uniform float u_intensity;
    uniform vec2 u_offset;
    uniform vec3 u_color;
    varying vec2 v_uv;
    void main() {
        vec2 p = (v_uv - 0.5 + u_offset) * u_scale;
        float t = u_time * u_speed;
        float v = sin(p.x * 6.0 + t) + cos(p.y * 6.0 - t) + sin((p.x + p.y) * 4.0 + t * 0.5);
        vec3 col = (0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v)) * u_intensity * u_color;
        gl_FragColor = vec4(col, 1.0);
    }
`;

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: DEVTOOLS_FRAGMENT,
    uniformNames: {
        u_speed: 'float',
        u_scale: 'float',
        u_intensity: 'float',
        u_offset: 'vec2',
        u_color: 'vec3'
    }
});

const uniforms: Record<string, UniformParam> = {
    u_speed: { type: 'float', value: 1 },
    u_scale: { type: 'float', value: 3 },
    u_intensity: { type: 'float', value: 1 },
    u_offset: { type: 'vec2', value: vec2([0, 0]) },
    u_color: { type: 'vec3', value: vec3([1, 1, 1]) }
};

export const DevtoolsDebug = () => {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <BaseShaderComponent
                programId='devtools-debug'
                shaderConfig={config}
                uniforms={uniforms}
                debug
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};
