export { fullscreenVertexShader as meshGradientVertexShader } from '@/effects/lib/fullscreenVertexShader';

export const meshGradientFragmentShader = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_color0;
    uniform vec3 u_color1;
    uniform vec3 u_color2;
    uniform vec3 u_color3;
    uniform float u_colorCount;
    uniform float u_speed;
    uniform float u_warp;
    uniform float u_warpScale;
    uniform float u_seed;
    uniform float u_audioLevel;
    uniform float u_audioStrength;

    varying vec2 v_texCoord;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    vec3 colorAt(float idx) {
        if (idx < 0.5) return u_color0;
        if (idx < 1.5) return u_color1;
        if (idx < 2.5) return u_color2;
        return u_color3;
    }

    vec2 pointPos(float idx, float t) {
        float s = u_seed + idx * 13.7;
        vec2 freq = vec2(0.6 + 0.2 * idx, 0.8 + 0.15 * idx);
        vec2 phase = vec2(s, s * 1.3 + 1.7);
        return vec2(0.5) + 0.34 * vec2(sin(t * freq.x + phase.x), cos(t * freq.y + phase.y));
    }

    void main() {
        float audio = u_audioStrength * u_audioLevel;
        float t = u_time * 0.001 * u_speed * (1.0 + 0.5 * audio);
        float warp = u_warp * (1.0 + audio);

        vec2 uv = v_texCoord;
        vec2 warped = uv + warp * 0.15 * vec2(
            valueNoise(uv * u_warpScale * 3.0 + t),
            valueNoise(uv * u_warpScale * 3.0 - t + 7.3)
        );

        vec3 col = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 4; i++) {
            float idx = float(i);
            float mask = step(idx, u_colorCount - 0.5);
            vec2 p = pointPos(idx, t);
            float d = distance(warped, p);
            float w = mask / (d * d + 0.0008);
            col += colorAt(idx) * w;
            wsum += w;
        }

        col /= max(wsum, 0.0001);
        gl_FragColor = vec4(col, 1.0);
    }
`;
