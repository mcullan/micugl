import { jsx as S } from "react/jsx-runtime";
import { useRef as a, useCallback as L, useEffect as F } from "react";
import { WebGLManager as h } from "../../../core/managers/WebGLManager.mjs";
const U = {}, y = "", z = {}, b = {}, P = ({
  programConfigs: E,
  renderCallback: p,
  renderOptions: i = U,
  className: _ = y,
  style: I = z,
  uniformUpdaters: T = b,
  useFastPath: d = !1,
  useDevicePixelRatio: w = !0
}) => {
  const f = a(null), o = a(null), g = a(null), u = a(null), A = a(0), m = a((n) => {
    const r = o.current, e = g.current;
    if (!r || !e) return;
    const s = n - A.current, t = r.context;
    if (d)
      r.fastRender(e, s, i.clear), t.drawArrays(t.TRIANGLE_STRIP, 0, 4);
    else {
      const c = r.resources.get(e);
      if (!c) return;
      r.prepareRender(e, i), R(s, c, t);
    }
    u.current = requestAnimationFrame(m.current);
  }), R = L((n, r, e) => {
    p(n, r, e);
  }, [p]);
  F(() => {
    m.current = (n) => {
      const r = o.current, e = g.current;
      if (!r || !e) return;
      const s = n - A.current, t = r.context;
      if (d)
        r.fastRender(e, s, i.clear), t.drawArrays(t.TRIANGLE_STRIP, 0, 4);
      else {
        const c = r.resources.get(e);
        if (!c) return;
        r.prepareRender(e, i), R(s, c, t);
      }
      u.current = requestAnimationFrame(m.current);
    };
  }, [i, d, R]);
  const l = L(() => {
    if (!f.current || !o.current) return;
    const n = window.innerWidth, r = window.innerHeight;
    o.current.setSize(n, r, w);
  }, [w]);
  return F(() => {
    if (f.current)
      try {
        const n = new h(f.current);
        o.current = n, l();
        const r = Object.entries(E);
        if (r.length > 0) {
          const [e, s] = r[0];
          n.createProgram(e, s), n.createBuffer(
            e,
            "a_position",
            new Float32Array([
              -1,
              -1,
              1,
              -1,
              -1,
              1,
              1,
              1
            ])
          ), g.current = e, n.setAttributeOnce(e, "a_position", {
            name: "a_position",
            size: 2,
            type: "FLOAT",
            normalized: !1,
            stride: 0,
            offset: 0
          });
          const t = T[e];
          t && t.forEach((c) => {
            n.registerUniformUpdater(
              e,
              c.name,
              c.type,
              c.updateFn
            );
          });
        }
        return A.current = performance.now(), u.current = requestAnimationFrame(m.current), window.addEventListener("resize", l), () => {
          window.removeEventListener("resize", l), u.current && cancelAnimationFrame(u.current), o.current && o.current.destroyAll();
        };
      } catch (n) {
        return console.error("Failed to initialize WebGL:", n), () => {
        };
      }
  }, [E, T, l]), /* @__PURE__ */ S(
    "canvas",
    {
      ref: f,
      className: _,
      style: I
    }
  );
};
export {
  P as ShaderEngine
};
