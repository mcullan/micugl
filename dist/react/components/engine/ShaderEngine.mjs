import { jsx as U } from "react/jsx-runtime";
import { useRef as s, useCallback as S, useEffect as E } from "react";
import { WebGLManager as v } from "../../../core/managers/WebGLManager.mjs";
const z = {}, N = "", b = {}, D = {}, q = ({
  programConfigs: T,
  renderCallback: w,
  renderOptions: a = z,
  className: I = N,
  style: h = b,
  width: L,
  height: F,
  uniformUpdaters: f = D,
  useFastPath: A = !1,
  useDevicePixelRatio: _ = !0,
  pixelRatio: y
}) => {
  const m = s(null), o = s(null), d = s(null), i = s(null), R = s(0), l = s((n) => {
    const e = o.current, r = d.current;
    if (!e || !r) return;
    const t = n - R.current, c = e.context;
    if (A)
      e.fastRender(r, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
    else {
      const u = e.resources.get(r);
      if (!u) return;
      e.prepareRender(r, a), g(t, u, c);
    }
    i.current = requestAnimationFrame(l.current);
  }), g = S((n, e, r) => {
    w(n, e, r);
  }, [w]);
  E(() => {
    l.current = (n) => {
      const e = o.current, r = d.current;
      if (!e || !r) return;
      const t = n - R.current, c = e.context;
      if (A)
        e.fastRender(r, t, a.clear), c.drawArrays(c.TRIANGLE_STRIP, 0, 4);
      else {
        const u = e.resources.get(r);
        if (!u) return;
        e.prepareRender(r, a), g(t, u, c);
      }
      i.current = requestAnimationFrame(l.current);
    };
  }, [a, A, g]);
  const p = S(() => {
    if (!m.current || !o.current) return;
    const n = L ?? window.innerWidth, e = F ?? window.innerHeight, r = y ?? (_ ? window.devicePixelRatio : 1), t = Math.floor(n * r), c = Math.floor(e * r);
    o.current.setSize(t, c, n, e);
  }, [_, y, L, F]);
  return E(() => {
    if (!m.current) return;
    const n = new v(m.current);
    o.current = n, p();
    const [[e, r]] = Object.entries(T);
    n.createProgram(e, r), n.createBuffer(e, "a_position", new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])), n.setAttributeOnce(e, "a_position", {
      name: "a_position",
      size: 2,
      type: "FLOAT",
      normalized: !1,
      stride: 0,
      offset: 0
    }), d.current = e;
    const t = f[e];
    return t && t.forEach((c) => {
      n.registerUniformUpdater(e, c.name, c.type, c.updateFn);
    }), R.current = performance.now(), i.current = requestAnimationFrame(l.current), window.addEventListener("resize", p), () => {
      window.removeEventListener("resize", p), i.current && cancelAnimationFrame(i.current), n.destroyAll();
    };
  }, [T, p, f]), E(() => {
    const n = o.current, e = d.current;
    if (!n || !e) return;
    const r = f[e];
    r && r.forEach((t) => {
      n.registerUniformUpdater(e, t.name, t.type, t.updateFn);
    });
  }, [f]), /* @__PURE__ */ U(
    "canvas",
    {
      ref: m,
      className: I,
      style: h
    }
  );
};
export {
  q as ShaderEngine
};
