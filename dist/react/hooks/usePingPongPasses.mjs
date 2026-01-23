import { useRef as N } from "react";
import { useUniformUpdaters as T } from "./useUniformUpdaters.mjs";
const d = {
  width: 0,
  height: 0,
  textureCount: 2,
  textureOptions: {
    minFilter: WebGLRenderingContext.LINEAR,
    magFilter: WebGLRenderingContext.LINEAR
  }
}, A = { clear: !0 };
function L(t) {
  return `${t.width}|${t.height}|${t.textureCount ?? 1}|${JSON.stringify(t.textureOptions ?? {})}`;
}
function S(t) {
  return `${t.clear ?? !0}|${JSON.stringify(t.clearColor ?? [0, 0, 0, 1])}`;
}
function m(t, e, h, a, p, o, s, c) {
  const i = `${t}-fb-a`, f = `${t}-fb-b`, r = {
    [i]: o,
    [f]: o
  };
  let u = [];
  if (c)
    u = c;
  else {
    u.push({
      programId: t,
      inputTextures: [],
      outputFramebuffer: i,
      renderOptions: s
    });
    let F = i;
    for (let n = 0; n < h; n++) {
      const U = e && n % 2 === 1 ? e : t, x = n % 2 === 0 ? i : f, $ = n % 2 === 0 ? f : i;
      F = $;
      const _ = e && n % 2 === 1 ? p[e] : a[t], E = {};
      _.forEach((R) => {
        const y = R.updateFn;
        E[R.name] = {
          type: R.type,
          value: (M, g, C) => y(M, g, C)
        };
      }), u.push({
        programId: U,
        inputTextures: [{
          id: x,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: $,
        uniforms: E,
        renderOptions: s
      });
    }
    const b = F, l = {};
    (e ? p[e] : a[t]).forEach((n) => {
      const U = n.updateFn;
      l[n.name] = {
        type: n.type,
        value: (x, $, _) => U(x, $, _)
      };
    }), u.push({
      programId: e ?? t,
      inputTextures: [{
        id: b,
        textureUnit: 0,
        bindingType: "read"
      }],
      outputFramebuffer: null,
      uniforms: l,
      renderOptions: s
    });
  }
  return { passes: u, framebuffers: r };
}
const K = ({
  programId: t,
  secondaryProgramId: e,
  iterations: h = 1,
  uniforms: a,
  secondaryUniforms: p = {},
  framebufferOptions: o = d,
  renderOptions: s = A,
  customPasses: c
}) => {
  const i = T(t, a), f = T(
    e ?? `${t}-secondary`,
    p
  ), r = N(null), u = L(o), F = S(s), b = c ? c.length.toString() : "none", l = `${t}|${e ?? ""}|${h}|${u}|${F}|${b}`;
  if (r.current && r.current.key === l)
    return typeof window < "u" && window.__micuglMetrics && window.__micuglMetrics.hookCacheHits++, r.current.result;
  typeof window < "u" && window.__micuglMetrics && window.__micuglMetrics.hookCacheMisses++;
  const w = m(
    t,
    e,
    h,
    i,
    f,
    o,
    s,
    c
  );
  return r.current = { key: l, result: w }, w;
};
export {
  K as usePingPongPasses
};
