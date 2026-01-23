import { jsx as x } from "react/jsx-runtime";
import { useRef as s, useCallback as W, useEffect as F } from "react";
import { WebGLManager as k } from "../../../core/managers/WebGLManager.mjs";
import { Passes as H } from "../../../core/systems/Passes.mjs";
const I = "", O = {};
function z(a) {
  return a.map(
    (t) => `${t.programId}|${t.outputFramebuffer ?? "screen"}|${t.inputTextures.map((o) => o.id).join(",")}`
  ).join("||");
}
const C = ({
  programConfigs: a,
  passes: t,
  framebuffers: o,
  className: L = I,
  style: M = O,
  width: w,
  height: h,
  renderWidth: g,
  renderHeight: p,
  useDevicePixelRatio: y = !0,
  pixelRatio: E
}) => {
  const u = s(null), c = s(null), m = s(null), d = s(null), R = s(0), l = s(""), _ = s((e) => {
    const r = c.current, n = m.current;
    if (!r || !n) return;
    const i = e - R.current;
    n.execute(i), d.current = requestAnimationFrame(_.current);
  }), f = W(() => {
    if (!u.current || !c.current) return;
    const e = w ?? window.innerWidth, r = h ?? window.innerHeight, n = E ?? (y ? window.devicePixelRatio : 1), i = g ?? Math.floor(e * n), P = p ?? Math.floor(r * n);
    c.current.setSize(i, P, e, r);
    const b = c.current, S = b.context.canvas;
    Object.entries(o ?? {}).forEach(([v, A]) => {
      const j = A.width || S.width, T = A.height || S.height;
      b.fbo.resizeFramebuffer(v, j, T);
    });
  }, [o, w, h, g, p, y, E]);
  return F(() => {
    if (!u.current) return;
    const e = new k(u.current);
    c.current = e, Object.entries(a).forEach(([n, i]) => {
      e.createProgram(n, i);
    }), Object.entries(o ?? {}).forEach(([n, i]) => {
      e.fbo.createFramebuffer(n, i);
    });
    const r = new H(e);
    return m.current = r, t.forEach((n) => {
      r.addPass(n);
    }), l.current = z(t), r.initializeResources(), f(), R.current = performance.now(), d.current = requestAnimationFrame(_.current), window.addEventListener("resize", f), () => {
      window.removeEventListener("resize", f), d.current && cancelAnimationFrame(d.current), c.current && c.current.destroyAll();
    };
  }, [a, o, f]), F(() => {
    const e = m.current;
    if (!e) return;
    const r = z(t);
    if (r === l.current) {
      typeof window < "u" && window.__micuglMetrics && window.__micuglMetrics.engineSkippedInits++;
      return;
    }
    l.current = r, typeof window < "u" && window.__micuglMetrics && window.__micuglMetrics.engineActualInits++, e.clearPasses(), t.forEach((n) => {
      e.addPass(n);
    }), e.initializeResources();
  }, [t]), /* @__PURE__ */ x(
    "canvas",
    {
      ref: u,
      className: L,
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        ...M
      }
    }
  );
};
export {
  C as PingPongShaderEngine
};
