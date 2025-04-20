import { jsx as b } from "react/jsx-runtime";
import { c as S } from "./useUniformUpdaters-D5WtqZpp.mjs";
import { u as d, B as C } from "./BaseShaderComponent-Be_evz2F.mjs";
const y = (
  /* glsl */
  `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`
), g = (
  /* glsl */
  `
precision highp float;
  
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_marbleScale;
uniform float u_turbulence;
uniform float u_swirl;
uniform vec3 u_colorStart;
uniform vec3 u_colorEnd;
uniform vec3 u_veinColor;
uniform float u_veinFrequency;
uniform float u_veinWidth;
uniform float u_tileScale;
  
varying vec2 v_texCoord;
  
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}
  
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}
  
float noise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), 0.0, 1.0);
}
  
float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;
  
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    value += amplitude * noise(p * frequency);
    maxValue += amplitude;
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value / maxValue;
}
  
vec2 swirl(vec2 p, float strength) {
  float theta = fbm(p, 3) * strength;
  float c = cos(theta);
  float s = sin(theta);
  return vec2(
    p.x * c - p.y * s,
    p.x * s + p.y * c
  );
}

vec2 applyTilePixelation(vec2 uv, float tileScale) {
  vec2 cell = floor(uv * tileScale);
  float cellHash = (1.3 * fbm(u_time * 0.00002 * vec2(pow(pow(cell.x * cell.y, 2.0), 0.5), 2.0) + cell, 1) + 0.8 * hash(cell)) * 0.5;
  float hashValue = cellHash * 3.0;
  float pixelSize = 1.0;

  if (hashValue < 1.0) pixelSize = 32.0;
    else if (hashValue < 1.3) pixelSize = 16.0;
    else if (hashValue < 1.8) pixelSize = 64.0;
    else if (hashValue < 1.85) pixelSize = 16.0;
    else if (hashValue < 2.2) pixelSize = 64.0;
    else if (hashValue < 2.3) pixelSize = 16.0;
    else if (hashValue < 2.6) pixelSize = 32.0;
    else pixelSize = 128.0;

  return floor(uv * pixelSize) / pixelSize;
}
  
void main() {
  vec2 uv = v_texCoord * 2.0 - 1.0;
  uv = uv * u_resolution / min(u_resolution.x, u_resolution.y);
  
  vec2 pixelatedUv = applyTilePixelation(uv, u_tileScale);
  
  float time = u_time * 0.25;
  
  vec2 swirlUv = swirl(pixelatedUv + vec2(time * 0.0005, time * 0.00083), max(0.0, min(10.0, u_swirl)));
  
  float baseNoise = fbm(swirlUv * max(0.1, u_marbleScale) + vec2(time * 0.1, time * 0.13), 5);
  
  float turbulenceAmount = max(0.0, min(1.0, u_turbulence));
  float turbulence = turbulenceAmount * fbm(swirlUv * max(0.1, u_marbleScale) * 2.0 + vec2(time * -0.15), 2);
  baseNoise = clamp(baseNoise + turbulence, 0.0, 1.0);
  
  float veinFreq = max(0.1, u_veinFrequency);
  float veinW = max(0.1, min(5.0, u_veinWidth));
  float veins = abs(sin(baseNoise * veinFreq * 3.14159));
  veins = pow(veins, veinW);
  veins = clamp(veins, 0.0, 1.0);
  
  vec3 baseColor = mix(u_colorStart, u_colorEnd, baseNoise);
  
  vec3 marbleColor = mix(baseColor, u_veinColor, veins);
  
  float highlight = pow(fbm(swirlUv * max(0.1, u_marbleScale) * 4.0, 2), 3.0) * 0.2;
 
  marbleColor = floor(marbleColor * 32.0) / 32.0;
  marbleColor = mix(marbleColor, u_veinColor, veins * 0.5);
  marbleColor = marbleColor + 0.0425;
  marbleColor = clamp(marbleColor, 0.0, 1.0);

  marbleColor = mix(marbleColor, u_veinColor, 0.7);
  gl_FragColor = vec4(marbleColor, 1.0);
}
`
), w = [0.8, 0.8, 0.9], V = [0.3, 0.3, 0.6], O = [0.1, 0.1, 0.3], z = [0.2, 0.2, 0.3], R = [0.1, 0.1, 0.2], F = [0.05, 0.05, 0.1], E = ({
  marbleScale: a = 3,
  tileScale: o = 1,
  turbulence: i = 0.5,
  swirl: t = 6,
  veinFrequency: r = 6,
  veinWidth: u = 2,
  colorStart: n = w,
  colorEnd: c = V,
  veinColor: s = O,
  colorStartDark: v = z,
  colorEndDark: f = R,
  veinColorDark: m = F,
  className: p = "",
  style: _
}) => {
  const e = d(), l = (x) => () => new Float32Array(x), h = S({
    vertexShader: y,
    fragmentShader: g,
    uniformNames: {
      u_marbleScale: "float",
      u_tileScale: "float",
      u_turbulence: "float",
      u_swirl: "float",
      u_colorStart: "vec3",
      u_colorEnd: "vec3",
      u_veinColor: "vec3",
      u_veinFrequency: "float",
      u_veinWidth: "float"
    }
  });
  return /* @__PURE__ */ b(
    C,
    {
      programId: "marble-shader",
      shaderConfig: h,
      className: p,
      style: _,
      uniforms: {
        marbleScale: { value: a, type: "float" },
        tileScale: { value: o, type: "float" },
        turbulence: { value: i, type: "float" },
        swirl: { value: t, type: "float" },
        veinFrequency: { value: r, type: "float" },
        veinWidth: { value: u, type: "float" },
        colorStart: {
          type: "vec3",
          value: l(e ? v : n)
          // value: toF32(isDarkMode ? colorStartDark : colorStart)
        },
        colorEnd: {
          type: "vec3",
          value: l(e ? f : c)
        },
        veinColor: {
          type: "vec3",
          value: l(e ? m : s)
        }
      }
    }
  );
};
export {
  E as M,
  g as a,
  y as m
};
