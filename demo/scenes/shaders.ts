export const QUAD_VERTEX = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_uv = a_position * 0.5 + 0.5;
    }
`;

export const PLASMA_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_offset;
    varying vec2 v_uv;
    void main() {
        vec2 p = v_uv * 6.0 + u_offset;
        float v = sin(p.x) + cos(p.y) + sin(u_time + p.x * p.y);
        vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v);
        gl_FragColor = vec4(col, 1.0);
    }
`;

export const WAVE_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    varying vec2 v_uv;
    void main() {
        vec2 uv = v_uv;
        float w = 0.5 + 0.5 * sin(uv.x * 10.0 + u_time);
        float g = 0.5 + 0.5 * cos(uv.y * 10.0 - u_time);
        gl_FragColor = vec4(w, g, 1.0 - w * g, 1.0);
    }
`;

export const GRADIENT_FRAGMENT = `
    precision highp float;
    uniform vec2 u_resolution;
    varying vec2 v_uv;
    void main() {
        vec2 uv = v_uv * (u_resolution / u_resolution);
        gl_FragColor = vec4(uv, 0.5, 1.0);
    }
`;

export const PINGPONG_VERTEX = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_position * 0.5 + 0.5;
    }
`;

export const PINGPONG_SIMULATION = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2D u_texture0;
    varying vec2 v_texCoord;

    void main() {
        vec2 uv = v_texCoord;
        vec2 texelSize = 1.0 / u_resolution;

        vec4 state = texture2D(u_texture0, uv);
        float height = state.r;
        float velocity = state.g;

        float north = texture2D(u_texture0, uv + vec2(0.0, texelSize.y)).r;
        float south = texture2D(u_texture0, uv - vec2(0.0, texelSize.y)).r;
        float east = texture2D(u_texture0, uv + vec2(texelSize.x, 0.0)).r;
        float west = texture2D(u_texture0, uv - vec2(texelSize.x, 0.0)).r;

        float newVelocity = velocity + ((north + south + east + west) / 4.0 - height) * 2.0;
        newVelocity *= 0.99;
        float newHeight = height + newVelocity;

        float t = u_time * 0.001;
        vec2 center = vec2(0.5 + 0.3 * sin(t), 0.5 + 0.3 * cos(t * 1.3));
        if (length(uv - center) < 0.03) {
            newHeight += 0.3;
        }

        gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);
    }
`;

export const PINGPONG_RENDER = `
    precision highp float;
    uniform sampler2D u_texture0;
    uniform vec3 u_color1;
    uniform vec3 u_color2;
    varying vec2 v_texCoord;

    void main() {
        float height = texture2D(u_texture0, v_texCoord).r;
        vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);
        gl_FragColor = vec4(color, 1.0);
    }
`;
