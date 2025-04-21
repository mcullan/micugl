import { CSSProperties } from 'react';
import { JSX } from 'react/jsx-runtime';

export declare const Marble: ({ marbleScale, tileScale, turbulence, swirl, veinFrequency, veinWidth, colorStart, colorEnd, veinColor, colorStartDark, colorEndDark, veinColorDark, className, style }: MarbleProps) => JSX.Element;

export declare const marbleFragmentShader = "\nprecision highp float;\n  \nuniform vec2 u_resolution;\nuniform float u_time;\nuniform float u_marbleScale;\nuniform float u_turbulence;\nuniform float u_swirl;\nuniform vec3 u_colorStart;\nuniform vec3 u_colorEnd;\nuniform vec3 u_veinColor;\nuniform float u_veinFrequency;\nuniform float u_veinWidth;\nuniform float u_tileScale;\n  \nvarying vec2 v_texCoord;\n  \nfloat hash(float n) {\n  return fract(sin(n) * 43758.5453123);\n}\n  \nfloat hash(vec2 p) {\n  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);\n}\n  \nfloat noise(vec2 x) {\n  vec2 i = floor(x);\n  vec2 f = fract(x);\n  \n  float a = hash(i);\n  float b = hash(i + vec2(1.0, 0.0));\n  float c = hash(i + vec2(0.0, 1.0));\n  float d = hash(i + vec2(1.0, 1.0));\n  \n  vec2 u = f * f * (3.0 - 2.0 * f);\n  \n  return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), 0.0, 1.0);\n}\n  \nfloat fbm(vec2 p, int octaves) {\n  float value = 0.0;\n  float amplitude = 0.5;\n  float frequency = 1.0;\n  float maxValue = 0.0;\n  \n  for (int i = 0; i < 10; i++) {\n    if (i >= octaves) break;\n    value += amplitude * noise(p * frequency);\n    maxValue += amplitude;\n    frequency *= 2.0;\n    amplitude *= 0.5;\n  }\n  \n  return value / maxValue;\n}\n  \nvec2 swirl(vec2 p, float strength) {\n  float theta = fbm(p, 3) * strength;\n  float c = cos(theta);\n  float s = sin(theta);\n  return vec2(\n    p.x * c - p.y * s,\n    p.x * s + p.y * c\n  );\n}\n\nvec2 applyTilePixelation(vec2 uv, float tileScale) {\n  vec2 cell = floor(uv * tileScale);\n  float cellHash = (1.3 * fbm(u_time * 0.00002 * vec2(pow(pow(cell.x * cell.y, 2.0), 0.5), 2.0) + cell, 1) + 0.8 * hash(cell)) * 0.5;\n  float hashValue = cellHash * 3.0;\n  float pixelSize = 1.0;\n\n  if (hashValue < 1.0) pixelSize = 32.0;\n    else if (hashValue < 1.3) pixelSize = 16.0;\n    else if (hashValue < 1.8) pixelSize = 64.0;\n    else if (hashValue < 1.85) pixelSize = 16.0;\n    else if (hashValue < 2.2) pixelSize = 64.0;\n    else if (hashValue < 2.3) pixelSize = 16.0;\n    else if (hashValue < 2.6) pixelSize = 32.0;\n    else pixelSize = 128.0;\n\n  return floor(uv * pixelSize) / pixelSize;\n}\n  \nvoid main() {\n  vec2 uv = v_texCoord * 2.0 - 1.0;\n  uv = uv * u_resolution / min(u_resolution.x, u_resolution.y);\n  \n  vec2 pixelatedUv = applyTilePixelation(uv, u_tileScale);\n  \n  float time = u_time * 0.25;\n  \n  vec2 swirlUv = swirl(pixelatedUv + vec2(time * 0.0005, time * 0.00083), max(0.0, min(10.0, u_swirl)));\n  \n  float baseNoise = fbm(swirlUv * max(0.1, u_marbleScale) + vec2(time * 0.1, time * 0.13), 5);\n  \n  float turbulenceAmount = max(0.0, min(1.0, u_turbulence));\n  float turbulence = turbulenceAmount * fbm(swirlUv * max(0.1, u_marbleScale) * 2.0 + vec2(time * -0.15), 2);\n  baseNoise = clamp(baseNoise + turbulence, 0.0, 1.0);\n  \n  float veinFreq = max(0.1, u_veinFrequency);\n  float veinW = max(0.1, min(5.0, u_veinWidth));\n  float veins = abs(sin(baseNoise * veinFreq * 3.14159));\n  veins = pow(veins, veinW);\n  veins = clamp(veins, 0.0, 1.0);\n  \n  vec3 baseColor = mix(u_colorStart, u_colorEnd, baseNoise);\n  \n  vec3 marbleColor = mix(baseColor, u_veinColor, veins);\n  \n  float highlight = pow(fbm(swirlUv * max(0.1, u_marbleScale) * 4.0, 2), 3.0) * 0.2;\n \n  marbleColor = floor(marbleColor * 32.0) / 32.0;\n  marbleColor = mix(marbleColor, u_veinColor, veins * 0.5);\n  marbleColor = marbleColor + 0.0425;\n  marbleColor = clamp(marbleColor, 0.0, 1.0);\n\n  marbleColor = mix(marbleColor, u_veinColor, 0.7);\n  gl_FragColor = vec4(marbleColor, 1.0);\n}\n";

export declare interface MarbleProps {
    marbleScale?: number;
    tileScale?: number;
    turbulence?: number;
    swirl?: number;
    colorStart?: Vec3;
    colorEnd?: Vec3;
    veinColor?: Vec3;
    colorStartDark?: Vec3;
    colorEndDark?: Vec3;
    veinColorDark?: Vec3;
    veinFrequency?: number;
    veinWidth?: number;
    className?: string;
    style?: CSSProperties;
}

export declare const marbleVertexShader = "\n  attribute vec2 a_position;\n  varying vec2 v_texCoord;\n\n  void main() {\n    gl_Position = vec4(a_position, 0.0, 1.0);\n    v_texCoord = a_position * 0.5 + 0.5;\n  }\n";

export declare const Ripple: ({ damping, mouseForce, color1, color2, iterations, className, style }: RippleProps) => JSX.Element;

export declare interface RippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3_2;
    color2?: Vec3_2;
    iterations?: number;
    className?: string;
    style?: CSSProperties;
}

export declare const rippleRenderShader = "\n  precision highp float;\n  \n  uniform vec2 u_resolution;\n  uniform float u_time;\n  uniform sampler2D u_texture0;\n  uniform vec3 u_color1;\n  uniform vec3 u_color2;\n  \n  varying vec2 v_texCoord;\n  \n  void main() {\n    vec2 uv = v_texCoord;\n    \n    vec4 state = texture2D(u_texture0, uv);\n    float height = state.r;\n    \n    vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);\n    \n    float t = u_time * 0.001;\n    float brightness = 1.0 + 0.1 * sin(uv.x * 10.0 + t) * sin(uv.y * 10.0 + t);\n    color *= brightness;\n    \n    gl_FragColor = vec4(color, 1.0);\n  }\n";

export declare const rippleSimulationShader = "\n  precision highp float;\n  \n  uniform vec2 u_resolution;\n  uniform float u_time;\n  uniform sampler2D u_texture0;\n  uniform vec2 u_mouse;\n  uniform float u_mouseForce;\n  uniform float u_damping;\n  \n  varying vec2 v_texCoord;\n  \n  void main() {\n    vec2 uv = v_texCoord;\n    vec2 texelSize = 1.0 / u_resolution;\n    \n    vec4 state = texture2D(u_texture0, uv);\n    float height = state.r;\n    float velocity = state.g;\n    \n    float north = texture2D(u_texture0, uv + vec2(0.0, texelSize.y)).r;\n    float south = texture2D(u_texture0, uv - vec2(0.0, texelSize.y)).r;\n    float east = texture2D(u_texture0, uv + vec2(texelSize.x, 0.0)).r;\n    float west = texture2D(u_texture0, uv - vec2(texelSize.x, 0.0)).r;\n    \n    float newVelocity = velocity + ((north + south + east + west) / 4.0 - height) * 2.0;\n    newVelocity *= u_damping;\n    \n    float newHeight = height + newVelocity;\n    \n    vec2 mouseVec = u_mouse - uv;\n    float mouseDistance = length(mouseVec);\n    if (mouseDistance < 0.05 && u_mouseForce > 0.0) {\n        newHeight += 0.5;\n    }\n    \n    float startTime = mod(u_time * 0.001, 10.0);\n    if (startTime < 0.2) {\n        vec2 center = vec2(0.5, 0.5);\n        float centerDist = length(uv - center);\n        if (centerDist < 0.05) {\n            newHeight += 0.5 * (1.0 - startTime * 5.0);\n        }\n    }\n    \n    gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);\n  }\n";

export declare const rippleVertexShader = "\n  attribute vec2 a_position;\n  varying vec2 v_texCoord;\n  void main() {\n    gl_Position = vec4(a_position, 0.0, 1.0);\n    v_texCoord = a_position * 0.5 + 0.5;\n  }\n";

declare type Vec3 = [number, number, number];

declare type Vec3_2 = [number, number, number];

export { }
