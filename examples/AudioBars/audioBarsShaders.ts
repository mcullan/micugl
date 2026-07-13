export const audioBarsVertexShader = /* glsl */`
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

export const audioBarsFragmentShader = /* glsl */`
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec4 u_audioBands;
  uniform float u_audioLevel;
  uniform vec3 u_colorLow;
  uniform vec3 u_colorHigh;

  varying vec2 v_texCoord;

  float bandAt(vec4 bands, float slot) {
    if (slot < 0.5) return bands.x;
    if (slot < 1.5) return bands.y;
    if (slot < 2.5) return bands.z;
    return bands.w;
  }

  void main() {
    vec2 uv = v_texCoord;

    float slot = floor(uv.x * 4.0);
    float column = fract(uv.x * 4.0);
    float height = bandAt(u_audioBands, slot);

    float gutter = smoothstep(0.06, 0.12, column) * (1.0 - smoothstep(0.88, 0.94, column));
    float fill = 1.0 - smoothstep(height - 0.012, height + 0.012, uv.y);
    float cap = exp(-90.0 * abs(uv.y - height)) * gutter;

    vec3 tint = mix(u_colorLow, u_colorHigh, slot / 3.0);
    vec3 bar = tint * fill * gutter;

    float pulse = 0.5 + 0.5 * sin(u_time * 0.002);
    float glow = u_audioLevel * (0.25 + 0.1 * pulse) * exp(-2.5 * length(uv - vec2(0.5, 0.15)));

    vec3 color = bar + tint * cap * 0.8 + vec3(glow);

    gl_FragColor = vec4(color, 1.0);
  }
`;
