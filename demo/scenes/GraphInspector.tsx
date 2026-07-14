import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { shaderNode } from '../../src/core/lib/graphPlanning';
import { ShaderGraph } from '../../src/react/components/ShaderGraph';
import { MicuglDevtools } from '../../src/react/devtools/MicuglDevtools';
import { useImageTexture } from '../../src/react/hooks/useImageTexture';
import { QUAD_VERTEX } from './shaders';

const STRIPES_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGB44FChIWCAST'
    + 'JgFX3gUMEwKHUAAA4/QAFwjPYbAAAAAElFTkSuQmCC';

const GLOW_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_gain;
    varying vec2 v_uv;
    void main() {
        vec2 c = v_uv - 0.5;
        float d = length(c);
        float pulse = 0.5 + 0.5 * sin(u_time * 1.3);
        float glow = u_gain * (0.6 + 0.4 * pulse) / (d * 5.0 + 0.25);
        gl_FragColor = vec4(glow, glow * 0.5, glow * 1.2, 1.0);
    }
`;

const GRAIN_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_gain;
    varying vec2 v_uv;
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
        float n = hash(floor(v_uv * u_resolution) + floor(u_time * 30.0));
        float g = u_gain * n;
        gl_FragColor = vec4(g, g, g, 1.0);
    }
`;

const COMPOSITE_FRAGMENT = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform sampler2D u_glow;
    uniform sampler2D u_grain;
    uniform sampler2D u_photo;
    uniform float u_blend;
    varying vec2 v_uv;
    void main() {
        vec3 glow = texture2D(u_glow, v_uv).rgb;
        vec3 grain = texture2D(u_grain, v_uv).rgb;
        vec3 photo = texture2D(u_photo, v_uv).rgb;
        vec3 base = mix(photo, glow, u_blend);
        gl_FragColor = vec4(base + grain * 0.15, 1.0);
    }
`;

const glowConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniformNames: { u_gain: 'float' }
});

const grainConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: GRAIN_FRAGMENT,
    uniformNames: { u_gain: 'float' }
});

const compositeConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniformNames: { u_blend: 'float' }
});

export const GraphInspector = () => {
    const photo = useImageTexture(STRIPES_IMAGE);

    const glow = shaderNode({
        id: 'glow',
        shaderConfig: glowConfig,
        uniforms: { gain: { type: 'float', value: 0.25 } },
        width: 320,
        height: 200
    });

    const grain = shaderNode({
        id: 'grain',
        shaderConfig: grainConfig,
        uniforms: { gain: { type: 'float', value: 0.75 } },
        width: 160,
        height: 160
    });

    const root = shaderNode({
        id: 'composite',
        shaderConfig: compositeConfig,
        uniforms: {
            glow,
            grain,
            photo: photo.texture,
            blend: { type: 'float', value: (time?: number) => 0.5 + 0.4 * Math.sin((time ?? 0) * 0.001 * 0.5) }
        }
    });

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <ShaderGraph root={root} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div
                style={{
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
                }}
            >
                <div>glow 320x200 + grain 160x160 + image {'->'} composite to canvas</div>
                <div>glow and grain both declare u_gain (0.25 vs 0.75)</div>
                <div>photo status: {photo.status}</div>
            </div>
            <MicuglDevtools defaultOpen />
        </div>
    );
};
