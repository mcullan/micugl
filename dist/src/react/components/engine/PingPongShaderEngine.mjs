import { jsx as p } from "react/jsx-runtime";
import { useRef as i, useCallback as y, useEffect as E } from "react";
import { WebGLManager as z } from "../../../core/managers/WebGLManager.mjs";
import { Passes as A } from "../../../core/systems/Passes.mjs";
const v = "", P = {}, O = ({
  programConfigs: h,
  passes: s,
  framebuffers: o,
  className: b = v,
  style: F = P,
  useDevicePixelRatio: d = !0
}) => {
  const a = i(null), c = i(null), f = i(null), u = i(null), l = i(0), w = i((e) => {
    const t = c.current, r = f.current;
    if (!t || !r) return;
    const n = e - l.current;
    r.execute(n), u.current = requestAnimationFrame(w.current);
  }), m = y(() => {
    if (!a.current || !c.current) return;
    const e = window.innerWidth, t = window.innerHeight;
    c.current.setSize(e, t, d);
    const r = c.current, n = r.context.canvas;
    Object.entries(o ?? []).forEach(([L, g]) => {
      const R = g.width || n.width, S = g.height || n.height;
      r.fbo.resizeFramebuffer(L, R, S);
    });
  }, [o, d]);
  return E(() => {
    if (a.current)
      try {
        const e = new z(a.current);
        c.current = e, Object.entries(h).forEach(([r, n]) => {
          e.createProgram(r, n);
        }), Object.entries(o ?? []).forEach(([r, n]) => {
          e.fbo.createFramebuffer(r, n);
        });
        const t = new A(e);
        return f.current = t, s.forEach((r) => {
          t.addPass(r);
        }), t.initializeResources(), m(), l.current = performance.now(), u.current = requestAnimationFrame(w.current), window.addEventListener("resize", m), () => {
          window.removeEventListener("resize", m), u.current && cancelAnimationFrame(u.current), c.current && c.current.destroyAll();
        };
      } catch (e) {
        return console.error("Failed to initialize WebGL:", e), () => {
        };
      }
  }, [h, s, o, m]), E(() => {
    const e = f.current;
    e && (e.clearPasses(), s.forEach((t) => {
      e.addPass(t);
    }), e.initializeResources());
  }, [s]), /* @__PURE__ */ p(
    "canvas",
    {
      ref: a,
      className: b,
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        ...F
      }
    }
  );
};
export {
  O as PingPongShaderEngine
};
