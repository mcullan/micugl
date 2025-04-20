import { jsx as A } from "react/jsx-runtime";
import { useRef as F, useCallback as S, useEffect as R, useMemo as z } from "react";
import { W as _, u as v } from "./useUniformUpdaters-D5WtqZpp.mjs";
class W {
  constructor(e) {
    this.passes = [], this.pingPongIds = /* @__PURE__ */ new Set(), this.webglManager = e;
  }
  addPass(e) {
    this.passes.push(e), e.outputFramebuffer && this.pingPongIds.add(e.outputFramebuffer), e.inputTextures.forEach((s) => {
      s.bindingType === "readwrite" && this.pingPongIds.add(s.id);
    });
  }
  clearPasses() {
    this.passes = [], this.pingPongIds.clear();
  }
  execute(e) {
    const s = this.webglManager.context, u = this.webglManager.fbo;
    for (const r of this.passes) {
      if (r.outputFramebuffer)
        if (this.pingPongIds.has(r.outputFramebuffer)) {
          const { write: t } = u.getPingPongIndices(r.outputFramebuffer);
          u.bindFramebuffer(r.outputFramebuffer, t);
        } else
          u.bindFramebuffer(r.outputFramebuffer);
      else
        u.bindFramebuffer(null);
      this.webglManager.prepareRender(r.programId, r.renderOptions), r.inputTextures.forEach((t) => {
        let i = t.bindingType === "read" ? 0 : 1;
        if (this.pingPongIds.has(t.id)) {
          const { read: o, write: p } = u.getPingPongIndices(t.id);
          i = t.bindingType === "read" || t.bindingType === "readwrite" ? o : p;
        }
        u.bindTexture(t.id, t.textureUnit, i), this.webglManager.setUniform(
          r.programId,
          `u_${t.id}`,
          t.textureUnit,
          "sampler2D"
        );
      }), this.webglManager.updateUniforms(r.programId, e), r.uniforms && Object.entries(r.uniforms).forEach(([t, i]) => {
        const o = typeof i.value == "function" ? i.value(e, s.canvas.width, s.canvas.height) : i.value;
        this.webglManager.setUniform(
          r.programId,
          t,
          o,
          i.type
        );
      }), s.drawArrays(s.TRIANGLE_STRIP, 0, 4), r.outputFramebuffer && this.pingPongIds.has(r.outputFramebuffer) && u.swapTextures(r.outputFramebuffer), r.inputTextures.forEach((t) => {
        t.bindingType === "readwrite" && this.pingPongIds.has(t.id) && u.swapTextures(t.id);
      });
    }
  }
  initializeResources() {
    for (const e of this.passes) {
      const s = this.webglManager.resources.get(e.programId);
      s && !s.buffers.a_position && (this.webglManager.createBuffer(
        e.programId,
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
      ), this.webglManager.setAttributeOnce(e.programId, "a_position", {
        name: "a_position",
        size: 2,
        type: "FLOAT",
        normalized: !1,
        stride: 0,
        offset: 0
      }));
    }
  }
}
const C = "", N = {}, j = ({
  programConfigs: a,
  passes: e,
  framebuffers: s,
  className: u = C,
  style: r = N,
  useDevicePixelRatio: t = !0
}) => {
  const i = F(null), o = F(null), p = F(null), l = F(null), g = F(0), h = F((n) => {
    const f = o.current, c = p.current;
    if (!f || !c) return;
    const m = n - g.current;
    c.execute(m), l.current = requestAnimationFrame(h.current);
  }), b = S(() => {
    if (!i.current || !o.current) return;
    const n = window.innerWidth, f = window.innerHeight;
    o.current.setSize(n, f, t);
    const c = o.current, m = c.context.canvas;
    Object.entries(s ?? []).forEach(([d, w]) => {
      const T = w.width || m.width, E = w.height || m.height;
      c.fbo.resizeFramebuffer(d, T, E);
    });
  }, [s, t]);
  return R(() => {
    if (i.current)
      try {
        const n = new _(i.current);
        o.current = n, Object.entries(a).forEach(([c, m]) => {
          n.createProgram(c, m);
        }), Object.entries(s ?? []).forEach(([c, m]) => {
          n.fbo.createFramebuffer(c, m);
        });
        const f = new W(n);
        return p.current = f, e.forEach((c) => {
          f.addPass(c);
        }), f.initializeResources(), b(), g.current = performance.now(), l.current = requestAnimationFrame(h.current), window.addEventListener("resize", b), () => {
          window.removeEventListener("resize", b), l.current && cancelAnimationFrame(l.current), o.current && o.current.destroyAll();
        };
      } catch (n) {
        return console.error("Failed to initialize WebGL:", n), () => {
        };
      }
  }, [a, e, s, b]), R(() => {
    const n = p.current;
    n && (n.clearPasses(), e.forEach((f) => {
      n.addPass(f);
    }), n.initializeResources());
  }, [e]), /* @__PURE__ */ A(
    "canvas",
    {
      ref: i,
      className: u,
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        ...r
      }
    }
  );
}, G = ({
  programId: a,
  secondaryProgramId: e,
  iterations: s = 1,
  uniforms: u,
  secondaryUniforms: r = {},
  framebufferOptions: t = {
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: {
      minFilter: WebGLRenderingContext.LINEAR,
      magFilter: WebGLRenderingContext.LINEAR
    }
  },
  renderOptions: i = { clear: !0 },
  customPasses: o
}) => {
  const p = v(a, u), l = v(
    e ?? `${a}-secondary`,
    r
  );
  return z(() => {
    const g = `${a}-fb-a`, h = `${a}-fb-b`, b = {
      [g]: t,
      [h]: t
    };
    let n = [];
    if (o)
      n = o;
    else {
      n.push({
        programId: a,
        inputTextures: [],
        outputFramebuffer: g,
        renderOptions: i
      });
      for (let d = 0; d < s; d++) {
        const w = e && d % 2 === 1 ? e : a, T = d % 2 === 0 ? g : h, E = d % 2 === 0 ? h : g, P = e && d % 2 === 1 ? l[e] : p[a], U = {};
        P.forEach((y) => {
          const L = y.updateFn;
          U[y.name] = {
            type: y.type,
            value: (M, I, x) => L(M, I, x)
          };
        }), n.push({
          programId: w,
          inputTextures: [{
            id: T,
            textureUnit: 0,
            bindingType: "read"
          }],
          outputFramebuffer: E,
          uniforms: U,
          renderOptions: i
        });
      }
      const f = s % 2 === 0 ? h : g, c = {};
      (e ? l[e] : p[a]).forEach((d) => {
        const w = d.updateFn;
        c[d.name] = {
          type: d.type,
          value: (T, E, P) => w(T, E, P)
        };
      }), n.push({
        programId: e ?? a,
        inputTextures: [{
          id: f,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: null,
        uniforms: c,
        renderOptions: i
      });
    }
    return { passes: n, framebuffers: b };
  }, [
    a,
    e,
    s,
    p,
    l,
    t,
    i,
    o
  ]);
}, O = {
  clear: !0,
  clearColor: [0, 0, 0, 1]
}, k = ({
  programId: a,
  shaderConfig: e,
  secondaryProgramId: s,
  secondaryShaderConfig: u,
  iterations: r = 1,
  uniforms: t,
  secondaryUniforms: i,
  framebufferOptions: o,
  className: p = "",
  style: l,
  customPasses: g,
  renderOptions: h = O
}) => {
  const b = s ?? `${a}-secondary`, n = {
    [a]: e
  };
  u && (n[b] = u);
  const { passes: f, framebuffers: c } = G({
    programId: a,
    secondaryProgramId: u ? b : void 0,
    iterations: r,
    uniforms: t,
    secondaryUniforms: i,
    framebufferOptions: o,
    renderOptions: h,
    customPasses: g
  });
  return /* @__PURE__ */ A(
    j,
    {
      programConfigs: n,
      passes: f,
      framebuffers: c,
      className: p,
      style: l
    }
  );
};
export {
  k as B,
  W as P,
  j as a,
  G as u
};
