import { createShaderConfig } from '@/core';
import { fullscreenVertexShader } from '@/effects/lib/fullscreenVertexShader';

const BAYER_CORE = `
    float bayer2x2(vec2 p) {
        float x = mod(p.x, 2.0);
        float y = mod(p.y, 2.0);
        return mod(x * 2.0 + y * 3.0, 4.0);
    }

    float bayerThreshold(vec2 pix, float levels) {
        float result = 0.0;
        float divisor = 4.0;
        float shrink = 1.0;
        for (int i = 0; i < 3; i++) {
            float active = step(float(i) + 0.5, levels);
            result += active * bayer2x2(floor(pix / shrink)) / divisor;
            divisor *= 4.0;
            shrink *= 2.0;
        }
        return result;
    }

    vec3 quantize(vec3 color, float threshold, float levels) {
        float steps = max(levels - 1.0, 1.0);
        return clamp(floor(color * steps + threshold) / steps, 0.0, 1.0);
    }
`;

const GRADIENT_HEAD = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_colorA;
    uniform vec3 u_colorB;
    uniform float u_levels;
    uniform float u_bayerLevels;
    uniform float u_scale;
    uniform float u_speed;

    varying vec2 v_texCoord;
`;

const GRADIENT_MAIN = `
    void main() {
        float g = clamp(v_texCoord.x + 0.25 * sin(u_time * u_speed + v_texCoord.y * 3.14159), 0.0, 1.0);
        vec3 color = mix(u_colorA, u_colorB, g);

        vec2 pix = floor(v_texCoord * u_resolution / u_scale);
        float threshold = bayerThreshold(pix, u_bayerLevels);

        gl_FragColor = vec4(quantize(color, threshold, u_levels), 1.0);
    }
`;

const SOURCE_HEAD = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform sampler2D u_src;
    uniform float u_levels;
    uniform float u_bayerLevels;
    uniform float u_scale;

    varying vec2 v_texCoord;
`;

const SOURCE_MAIN = `
    void main() {
        vec3 color = texture2D(u_src, v_texCoord).rgb;

        vec2 pix = floor(v_texCoord * u_resolution / u_scale);
        float threshold = bayerThreshold(pix, u_bayerLevels);

        gl_FragColor = vec4(quantize(color, threshold, u_levels), 1.0);
    }
`;

export const ditherGradientFragmentShader = GRADIENT_HEAD + BAYER_CORE + GRADIENT_MAIN;

export const ditherSourceFragmentShader = SOURCE_HEAD + BAYER_CORE + SOURCE_MAIN;

export const ditherGradientConfig = createShaderConfig({
    vertexShader: fullscreenVertexShader,
    fragmentShader: ditherGradientFragmentShader,
    uniformNames: {
        u_colorA: 'vec3',
        u_colorB: 'vec3',
        u_levels: 'float',
        u_bayerLevels: 'float',
        u_scale: 'float',
        u_speed: 'float'
    }
});

export const ditherSourceConfig = createShaderConfig({
    vertexShader: fullscreenVertexShader,
    fragmentShader: ditherSourceFragmentShader,
    uniformNames: {
        u_levels: 'float',
        u_bayerLevels: 'float',
        u_scale: 'float'
    }
});
