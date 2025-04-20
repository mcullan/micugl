import { useRef as E, useCallback as b, useEffect as S, useState as h } from "react";
import { jsx as F } from "react/jsx-runtime";
import { W as I, u as D } from "./useUniformUpdaters-D5WtqZpp.mjs";
const U = {}, k = "", N = {}, v = {}, y = ({
  programConfigs: i,
  renderCallback: f,
  renderOptions: n = U,
  className: l = k,
  style: u = N,
  uniformUpdaters: d = v,
  useFastPath: R = !1,
  useDevicePixelRatio: A = !0
}) => {
  const g = E(null), c = E(null), p = E(null), a = E(null), L = E(0), T = E((t) => {
    const e = c.current, r = p.current;
    if (!e || !r) return;
    const m = t - L.current, s = e.context;
    if (R)
      e.fastRender(r, m, n.clear), s.drawArrays(s.TRIANGLE_STRIP, 0, 4);
    else {
      const o = e.resources.get(r);
      if (!o) return;
      e.prepareRender(r, n), _(m, o, s);
    }
    a.current = requestAnimationFrame(T.current);
  }), _ = b((t, e, r) => {
    f(t, e, r);
  }, [f]);
  S(() => {
    T.current = (t) => {
      const e = c.current, r = p.current;
      if (!e || !r) return;
      const m = t - L.current, s = e.context;
      if (R)
        e.fastRender(r, m, n.clear), s.drawArrays(s.TRIANGLE_STRIP, 0, 4);
      else {
        const o = e.resources.get(r);
        if (!o) return;
        e.prepareRender(r, n), _(m, o, s);
      }
      a.current = requestAnimationFrame(T.current);
    };
  }, [n, R, _]);
  const w = b(() => {
    if (!g.current || !c.current) return;
    const t = window.innerWidth, e = window.innerHeight;
    c.current.setSize(t, e, A);
  }, [A]);
  return S(() => {
    if (g.current)
      try {
        const t = new I(g.current);
        c.current = t, w();
        const e = Object.entries(i);
        if (e.length > 0) {
          const [r, m] = e[0];
          t.createProgram(r, m), t.createBuffer(
            r,
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
          ), p.current = r, t.setAttributeOnce(r, "a_position", {
            name: "a_position",
            size: 2,
            type: "FLOAT",
            normalized: !1,
            stride: 0,
            offset: 0
          });
          const s = d[r];
          s && s.forEach((o) => {
            t.registerUniformUpdater(
              r,
              o.name,
              o.type,
              o.updateFn
            );
          });
        }
        return L.current = performance.now(), a.current = requestAnimationFrame(T.current), window.addEventListener("resize", w), () => {
          window.removeEventListener("resize", w), a.current && cancelAnimationFrame(a.current), c.current && c.current.destroyAll();
        };
      } catch (t) {
        return console.error("Failed to initialize WebGL:", t), () => {
        };
      }
  }, [i, d, w]), /* @__PURE__ */ F(
    "canvas",
    {
      ref: g,
      className: l,
      style: u
    }
  );
}, G = () => {
  const [i, f] = h(!1);
  return S(() => {
    const n = () => {
      const u = document.documentElement.classList.contains("dark");
      f(u);
    };
    n();
    const l = new MutationObserver((u) => {
      u.forEach((d) => {
        d.attributeName === "class" && n();
      });
    });
    return l.observe(document.documentElement, { attributes: !0 }), () => {
      l.disconnect();
    };
  }, []), i;
}, M = {
  clear: !0,
  clearColor: [0, 0, 0, 1]
}, O = ({
  programId: i,
  shaderConfig: f,
  uniforms: n,
  className: l = "",
  style: u,
  renderOptions: d = M
}) => {
  const R = { [i]: f }, A = D(i, n);
  return /* @__PURE__ */ F(
    y,
    {
      programConfigs: R,
      renderCallback: (c, p, a) => {
        a.drawArrays(a.TRIANGLE_STRIP, 0, 4);
      },
      uniformUpdaters: A,
      className: l,
      style: u,
      useFastPath: !0,
      renderOptions: d
    }
  );
};
export {
  O as B,
  y as S,
  G as u
};
