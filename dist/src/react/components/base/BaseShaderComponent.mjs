import { jsx as i } from "react/jsx-runtime";
import "react";
import { useUniformUpdaters as p } from "../../hooks/useUniformUpdaters.mjs";
import { ShaderEngine as u } from "../engine/ShaderEngine.mjs";
const d = {
  clear: !0,
  clearColor: [0, 0, 0, 1]
}, h = ({
  programId: r,
  shaderConfig: o,
  uniforms: t,
  className: s = "",
  style: a,
  renderOptions: n = d
}) => {
  const m = { [r]: o }, c = p(r, t);
  return /* @__PURE__ */ i(
    u,
    {
      programConfigs: m,
      renderCallback: (l, C, e) => {
        e.drawArrays(e.TRIANGLE_STRIP, 0, 4);
      },
      uniformUpdaters: c,
      className: s,
      style: a,
      useFastPath: !0,
      renderOptions: n
    }
  );
};
export {
  h as BaseShaderComponent
};
