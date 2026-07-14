export const grainFragmentShader = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_color;
    uniform vec3 u_grainColor;
    uniform float u_intensity;
    uniform float u_scale;
    uniform float u_speed;
    uniform float u_audioLevel;
    uniform float u_audioStrength;

    varying vec2 v_texCoord;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    void main() {
        float t = u_time * u_speed;
        vec2 cell = floor(v_texCoord * u_resolution / u_scale);
        float tick = floor(t * 24.0);
        float n = hash21(cell + vec2(tick, tick * 1.7));

        float intensity = u_intensity * (1.0 + u_audioStrength * u_audioLevel);
        vec3 col = mix(u_color, u_grainColor, n * intensity);
        gl_FragColor = vec4(col, 1.0);
    }
`;
