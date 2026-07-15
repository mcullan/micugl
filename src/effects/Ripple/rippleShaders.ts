export const rippleVertexShader = /* glsl */`
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

export const rippleSimulationFragmentShader = /* glsl */`
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec2 u_mouse;
  uniform float u_mouseForce;
  uniform float u_damping;
  uniform float u_autoDrip;
  uniform float u_audioLevel;
  uniform float u_audioStrength;

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
    newVelocity *= u_damping;

    float newHeight = height + newVelocity;

    float mouseDistance = length(u_mouse - uv);
    if (mouseDistance < 0.05 && u_mouseForce > 0.0) {
      newHeight += u_mouseForce;
    }

    float phase = mod(u_time, 10.0);
    if (phase < 0.2) {
      float centerDist = length(uv - vec2(0.5, 0.5));
      if (centerDist < 0.05) {
        float amplitude = u_autoDrip * (1.0 + u_audioStrength * 2.0 * u_audioLevel);
        newHeight += 0.5 * (1.0 - phase * 5.0) * amplitude;
      }
    }

    gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);
  }
`;

export const rippleRenderFragmentShader = /* glsl */`
  precision highp float;

  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec3 u_color1;
  uniform vec3 u_color2;

  varying vec2 v_texCoord;

  void main() {
    vec2 uv = v_texCoord;

    float height = texture2D(u_texture0, uv).r;
    vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);

    float shimmer = 1.0 + 0.1 * sin(uv.x * 10.0 + u_time) * sin(uv.y * 10.0 + u_time);
    color *= shimmer;

    gl_FragColor = vec4(color, 1.0);
  }
`;
