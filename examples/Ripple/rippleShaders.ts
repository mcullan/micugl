export const rippleVertexShader = /* glsl */`
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

export const rippleSimulationShader = /* glsl */`
  precision highp float;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec2 u_mouse;
  uniform float u_mouseForce;
  uniform float u_damping;
  
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
    
    vec2 mouseVec = u_mouse - uv;
    float mouseDistance = length(mouseVec);
    if (mouseDistance < 0.05 && u_mouseForce > 0.0) {
        newHeight += 0.5;
    }
    
    float startTime = mod(u_time * 0.001, 10.0);
    if (startTime < 0.2) {
        vec2 center = vec2(0.5, 0.5);
        float centerDist = length(uv - center);
        if (centerDist < 0.05) {
            newHeight += 0.5 * (1.0 - startTime * 5.0);
        }
    }
    
    gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);
  }
`;

export const rippleRenderShader = /* glsl */`
  precision highp float;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  
  varying vec2 v_texCoord;
  
  void main() {
    vec2 uv = v_texCoord;
    
    vec4 state = texture2D(u_texture0, uv);
    float height = state.r;
    
    vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);
    
    float t = u_time * 0.001;
    float brightness = 1.0 + 0.1 * sin(uv.x * 10.0 + t) * sin(uv.y * 10.0 + t);
    color *= brightness;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;
