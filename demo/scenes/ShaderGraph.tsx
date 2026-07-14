import { useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { shaderNode } from '../../src/core/lib/graphPlanning';
import { ShaderGraph as ShaderGraphComponent } from '../../src/react/components/ShaderGraph';
import { useImageTexture } from '../../src/react/hooks/useImageTexture';
import { QUAD_VERTEX } from './shaders';

const STRIPES_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGB44FChIWCAST'
    + 'JgFX3gUMEwKHUAAA4/QAFwjPYbAAAAAElFTkSuQmCC';

const NOISE_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_scale;
    varying vec2 v_uv;
    void main() {
        vec2 p = v_uv * u_scale;
        float wave = sin(p.x + u_time) + sin(p.y * 1.3 - u_time * 0.7);
        float band = 0.5 + 0.5 * sin(wave * 2.0 + u_time * 0.5);
        gl_FragColor = vec4(vec3(band, band * 0.6, 1.0 - band), 1.0);
    }
`;

const WARP_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform sampler2D u_noise;
    uniform sampler2D u_stripes;
    uniform float u_warp;
    varying vec2 v_uv;
    void main() {
        vec3 field = texture2D(u_noise, v_uv).rgb;
        vec2 offset = (field.rg - 0.5) * u_warp;
        vec3 stripes = texture2D(u_stripes, fract(v_uv + offset)).rgb;
        float pulse = 0.5 + 0.5 * sin(u_time * 1.5);
        gl_FragColor = vec4(mix(field, stripes, 0.4 + 0.3 * pulse), 1.0);
    }
`;

const COMPOSITE_FRAGMENT = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform sampler2D u_warped;
    uniform float u_vignette;
    varying vec2 v_uv;
    void main() {
        vec3 warped = texture2D(u_warped, v_uv).rgb;
        vec2 centered = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
        float falloff = 1.0 - u_vignette * dot(centered, centered);
        gl_FragColor = vec4(warped * falloff, 1.0);
    }
`;

const noiseConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: NOISE_FRAGMENT,
    uniformNames: { u_scale: 'float' }
});

const warpConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WARP_FRAGMENT,
    uniformNames: { u_warp: 'float' }
});

const compositeConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniformNames: { u_vignette: 'float' }
});

export const ShaderGraph = () => {
    const [vignette, setVignette] = useState(0.4);
    const stripes = useImageTexture(STRIPES_IMAGE);

    const noise = shaderNode({
        id: 'noise',
        shaderConfig: noiseConfig,
        uniforms: {
            scale: { type: 'float', value: (time?: number) => 6.0 + 2.0 * Math.sin((time ?? 0) * 0.001 * 0.4) }
        },
        width: 256,
        height: 256
    });

    const warped = shaderNode({
        id: 'warped',
        shaderConfig: warpConfig,
        uniforms: {
            noise,
            stripes: stripes.texture,
            warp: { type: 'float', value: 0.12 }
        },
        width: 512,
        height: 512
    });

    const root = shaderNode({
        id: 'composite',
        shaderConfig: compositeConfig,
        uniforms: {
            warped,
            vignette: { type: 'float', value: vignette, transition: { duration: 600, easing: 'easeInOut' } }
        }
    });

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <ShaderGraphComponent
                root={root}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
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
                <div>noise 256x256 -&gt; warped 512x512 + image -&gt; composite to canvas</div>
                <div>stripes status: {stripes.status}</div>
                <button
                    type='button'
                    onClick={() => { setVignette(current => (current > 0.5 ? 0.15 : 0.9)) }}
                    style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                >
                    transition u_vignette (now {vignette})
                </button>
            </div>
        </div>
    );
};
