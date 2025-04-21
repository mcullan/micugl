import { jsx as E } from "react/jsx-runtime";
import { PingPongShaderEngine as d } from "../engine/PingPongShaderEngine.mjs";
import { usePingPongPasses as x } from "../../hooks/usePingPongPasses.mjs";
const N = {
  clear: !0,
  clearColor: [0, 0, 0, 1]
}, b = ({
  programId: o,
  shaderConfig: e,
  secondaryProgramId: t,
  secondaryShaderConfig: r,
  iterations: a = 1,
  uniforms: P,
  secondaryUniforms: c,
  framebufferOptions: m,
  className: i = "",
  style: g,
  customPasses: f,
  renderOptions: p = N
}) => {
  const n = t ?? `${o}-secondary`, s = {
    [o]: e
  };
  r && (s[n] = r);
  const { passes: u, framebuffers: l } = x({
    programId: o,
    secondaryProgramId: r ? n : void 0,
    iterations: a,
    uniforms: P,
    secondaryUniforms: c,
    framebufferOptions: m,
    renderOptions: p,
    customPasses: f
  });
  return /* @__PURE__ */ E(
    d,
    {
      programConfigs: s,
      passes: u,
      framebuffers: l,
      className: i,
      style: g
    }
  );
};
export {
  b as BasePingPongShaderComponent
};
