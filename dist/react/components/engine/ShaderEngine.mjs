import { jsx as I } from "react/jsx-runtime";
import { useRef as s, useCallback as _, useEffect as g } from "react";
import { WebGLManager as U } from "../../../core/managers/WebGLManager.mjs";
const h = {}, y = "", z = {}, N = {}, q = ({
  programConfigs: E,
  renderCallback: T,
  renderOptions: a = h,
  className: F = y,
  style: S = z,
  uniformUpdaters: w = N,
  useFastPath: A = !1,
  useDevicePixelRatio: L = !0
}) => {
  const f = s(null), o = s(null), m = s(null), i = s(null), R = s(0), l = s((r) => {
    const e = o.current, n = m.current;
    if (!e || !n) return;
    const t = r - R.current, c = e.context;
    if (A)
      e.fastRender(n, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
    else {
      const u = e.resources.get(n);
      if (!u) return;
      e.prepareRender(n, a), p(t, u, c);
    }
    i.current = requestAnimationFrame(l.current);
  }), p = _((r, e, n) => {
    T(r, e, n);
  }, [T]);
  g(() => {
    l.current = (r) => {
      const e = o.current, n = m.current;
      if (!e || !n) return;
      const t = r - R.current, c = e.context;
      if (A)
        e.fastRender(n, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
      else {
        const u = e.resources.get(n);
        if (!u) return;
        e.prepareRender(n, a), p(t, u, c);
      }
      i.current = requestAnimationFrame(l.current);
    };
  }, [a, A, p]);
  const d = _(() => {
    if (!f.current || !o.current) return;
    const r = window.innerWidth, e = window.innerHeight;
    o.current.setSize(r, e, L);
  }, [L]);
  return g(() => {
    if (!f.current) return;
    const r = new U(f.current);
    o.current = r, d();
    const [[e, n]] = Object.entries(E);
    return r.createProgram(e, n), r.createBuffer(e, "a_position", new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])), r.setAttributeOnce(e, "a_position", {
      name: "a_position",
      size: 2,
      type: "FLOAT",
      normalized: !1,
      stride: 0,
      offset: 0
    }), m.current = e, R.current = performance.now(), i.current = requestAnimationFrame(l.current), window.addEventListener("resize", d), () => {
      window.removeEventListener("resize", d), i.current && cancelAnimationFrame(i.current), r.destroyAll();
    };
  }, [E, d]), g(() => {
    const r = o.current, e = m.current;
    if (!r || !e) return;
    const n = w[e];
    n && n.forEach((t) => {
      r.registerUniformUpdater(e, t.name, t.type, t.updateFn);
    });
  }, [w]), /* @__PURE__ */ I(
    "canvas",
    {
      ref: f,
      className: F,
      style: S
    }
  );
};
export {
  q as ShaderEngine
};
