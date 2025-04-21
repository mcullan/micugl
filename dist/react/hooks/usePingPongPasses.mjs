import { useMemo as G } from "react";
import { useUniformUpdaters as m } from "./useUniformUpdaters.mjs";
const y = ({
  programId: t,
  secondaryProgramId: n,
  iterations: o = 1,
  uniforms: C,
  secondaryUniforms: E = {},
  framebufferOptions: l = {
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: {
      minFilter: WebGLRenderingContext.LINEAR,
      magFilter: WebGLRenderingContext.LINEAR
    }
  },
  renderOptions: s = { clear: !0 },
  customPasses: c
}) => {
  const p = m(t, C), U = m(
    n ?? `${t}-secondary`,
    E
  );
  return G(() => {
    const u = `${t}-fb-a`, f = `${t}-fb-b`, L = {
      [u]: l,
      [f]: l
    };
    let i = [];
    if (c)
      i = c;
    else {
      i.push({
        programId: t,
        inputTextures: [],
        outputFramebuffer: u,
        renderOptions: s
      });
      for (let e = 0; e < o; e++) {
        const r = n && e % 2 === 1 ? n : t, b = e % 2 === 0 ? u : f, x = e % 2 === 0 ? f : u, F = n && e % 2 === 1 ? U[n] : p[t], T = {};
        F.forEach((h) => {
          const v = h.updateFn;
          T[h.name] = {
            type: h.type,
            value: (A, M, $) => v(A, M, $)
          };
        }), i.push({
          programId: r,
          inputTextures: [{
            id: b,
            textureUnit: 0,
            bindingType: "read"
          }],
          outputFramebuffer: x,
          uniforms: T,
          renderOptions: s
        });
      }
      const R = o % 2 === 0 ? f : u, a = {};
      (n ? U[n] : p[t]).forEach((e) => {
        const r = e.updateFn;
        a[e.name] = {
          type: e.type,
          value: (b, x, F) => r(b, x, F)
        };
      }), i.push({
        programId: n ?? t,
        inputTextures: [{
          id: R,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: null,
        uniforms: a,
        renderOptions: s
      });
    }
    return { passes: i, framebuffers: L };
  }, [
    t,
    n,
    o,
    p,
    U,
    l,
    s,
    c
  ]);
};
export {
  y as usePingPongPasses
};
