import { jsx as S } from "react/jsx-runtime";
import { createShaderConfig as O } from "../../src/core/lib/createShaderConfig.mjs";
import { vec3 as o } from "../../src/core/lib/vectorUtils.mjs";
import { BaseShaderComponent as y } from "../../src/react/components/base/BaseShaderComponent.mjs";
import { useDarkMode as C } from "../../src/react/hooks/useDarkMode.mjs";
import { marbleVertexShader as R, marbleFragmentShader as h } from "./marbleShaders.mjs";
const b = [0.8, 0.8, 0.9], D = [0.3, 0.3, 0.6], E = [0.1, 0.1, 0.3], L = [0.2, 0.2, 0.3], g = [0.1, 0.1, 0.2], A = [0.05, 0.05, 0.1], M = ({
  marbleScale: t = 3,
  tileScale: r = 1,
  turbulence: a = 0.5,
  swirl: l = 6,
  veinFrequency: n = 6,
  veinWidth: c = 2,
  colorStart: u = b,
  colorEnd: f = D,
  veinColor: m = E,
  colorStartDark: i = L,
  colorEndDark: v = g,
  veinColorDark: s = A,
  className: p = "",
  style: _
}) => {
  const e = C(), d = O({
    vertexShader: R,
    fragmentShader: h,
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
  return /* @__PURE__ */ S(
    y,
    {
      programId: "marble-shader",
      shaderConfig: d,
      className: p,
      style: _,
      uniforms: {
        marbleScale: { value: t, type: "float" },
        tileScale: { value: r, type: "float" },
        turbulence: { value: a, type: "float" },
        swirl: { value: l, type: "float" },
        veinFrequency: { value: n, type: "float" },
        veinWidth: { value: c, type: "float" },
        colorStart: {
          type: "vec3",
          value: o(e ? i : u)
        },
        colorEnd: {
          type: "vec3",
          value: o(e ? v : f)
        },
        veinColor: {
          type: "vec3",
          value: o(e ? s : m)
        }
      }
    }
  );
};
export {
  M as Marble,
  M as default
};
