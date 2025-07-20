import { jsx as u } from "react/jsx-runtime";
import "react";
import { useUniformUpdaters as d } from "../../hooks/useUniformUpdaters.mjs";
import { ShaderEngine as C } from "../engine/ShaderEngine.mjs";
const E = {
  clear: !0,
  clearColor: [0, 0, 0, 1]
}, U = ({
  programId: r,
  shaderConfig: o,
  uniforms: t,
  skipDefaultUniforms: s = !1,
  width: a,
  height: n,
  pixelRatio: m,
  className: c = "",
  style: i,
  renderOptions: p = E
}) => {
  const f = { [r]: o }, l = d(r, t, { skipDefaultUniforms: s });
  return /* @__PURE__ */ u(
    C,
    {
      programConfigs: f,
      renderCallback: (S, _, e) => {
        e.drawArrays(e.TRIANGLE_STRIP, 0, 4);
      },
      uniformUpdaters: l,
      width: a,
      height: n,
      pixelRatio: m,
      className: c,
      style: i,
      useFastPath: !0,
      renderOptions: p
    }
  );
};
export {
  U as BaseShaderComponent
};
