import { jsx as y } from "react/jsx-runtime";
import { useRef as s, useCallback as I, useEffect as g } from "react";
import { WebGLManager as z } from "../../../core/managers/WebGLManager.mjs";
const N = {}, b = "", D = {}, P = {}, M = ({
  programConfigs: E,
  renderCallback: T,
  renderOptions: a = N,
  className: U = b,
  style: v = D,
  width: w,
  height: L,
  uniformUpdaters: _ = P,
  useFastPath: A = !1,
  useDevicePixelRatio: F = !0,
  pixelRatio: S
}) => {
  const f = s(null), o = s(null), m = s(null), i = s(null), R = s(0), d = s((n) => {
    const e = o.current, r = m.current;
    if (!e || !r) return;
    const t = n - R.current, c = e.context;
    if (A)
      e.fastRender(r, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
    else {
      const u = e.resources.get(r);
      if (!u) return;
      e.prepareRender(r, a), p(t, u, c);
    }
    i.current = requestAnimationFrame(d.current);
  }), p = I((n, e, r) => {
    T(n, e, r);
  }, [T]);
  g(() => {
    d.current = (n) => {
      const e = o.current, r = m.current;
      if (!e || !r) return;
      const t = n - R.current, c = e.context;
      if (A)
        e.fastRender(r, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
      else {
        const u = e.resources.get(r);
        if (!u) return;
        e.prepareRender(r, a), p(t, u, c);
      }
      i.current = requestAnimationFrame(d.current);
    };
  }, [a, A, p]);
  const l = I(() => {
    if (!f.current || !o.current) return;
    const n = w ?? window.innerWidth, e = L ?? window.innerHeight, r = S ?? (F ? window.devicePixelRatio : 1);
    o.current.setSize(n, e, r);
  }, [F, S, w, L]);
  return g(() => {
    if (!f.current) return;
    const n = new z(f.current);
    o.current = n, l();
    const [[e, r]] = Object.entries(E);
    return n.createProgram(e, r), n.createBuffer(e, "a_position", new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])), n.setAttributeOnce(e, "a_position", {
      name: "a_position",
      size: 2,
      type: "FLOAT",
      normalized: !1,
      stride: 0,
      offset: 0
    }), m.current = e, R.current = performance.now(), i.current = requestAnimationFrame(d.current), window.addEventListener("resize", l), () => {
      window.removeEventListener("resize", l), i.current && cancelAnimationFrame(i.current), n.destroyAll();
    };
  }, [E, l]), g(() => {
    const n = o.current, e = m.current;
    if (!n || !e) return;
    const r = _[e];
    r && r.forEach((t) => {
      n.registerUniformUpdater(e, t.name, t.type, t.updateFn);
    });
  }, [_]), /* @__PURE__ */ y(
    "canvas",
    {
      ref: f,
      className: U,
      style: v
    }
  );
};
export {
  M as ShaderEngine
};
