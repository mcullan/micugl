import { createShaderConfig } from '@/core';
import { fullscreenVertexShader } from '@/effects/lib/fullscreenVertexShader';

export const blurFragmentShader = `
    precision highp float;

    uniform sampler2D u_src;
    uniform vec2 u_resolution;
    uniform vec2 u_direction;
    uniform float u_radius;

    varying vec2 v_texCoord;

    void main() {
        vec2 texel = u_direction / u_resolution;
        float scale = u_radius / 8.0;
        vec2 off1 = texel * (1.3846153846 * scale);
        vec2 off2 = texel * (3.2307692308 * scale);

        vec3 sum = texture2D(u_src, v_texCoord).rgb * 0.2270270270;
        sum += texture2D(u_src, v_texCoord + off1).rgb * 0.3162162162;
        sum += texture2D(u_src, v_texCoord - off1).rgb * 0.3162162162;
        sum += texture2D(u_src, v_texCoord + off2).rgb * 0.0702702703;
        sum += texture2D(u_src, v_texCoord - off2).rgb * 0.0702702703;

        gl_FragColor = vec4(sum, 1.0);
    }
`;

export const blurConfig = createShaderConfig({
    vertexShader: fullscreenVertexShader,
    fragmentShader: blurFragmentShader,
    uniformNames: {
        u_direction: 'vec2',
        u_radius: 'float'
    }
});
