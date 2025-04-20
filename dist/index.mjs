import { F as v, W as y, a as P, c as U, b as C, d as $, u as O } from "./useUniformUpdaters-D5WtqZpp.mjs";
import { B as L, P as R, a as S, u as A } from "./BasePingPongShaderComponent-FY62Kl02.mjs";
import { B as W, S as _, u as G } from "./BaseShaderComponent-Be_evz2F.mjs";
class I {
  constructor(e) {
    this.effects = /* @__PURE__ */ new Map(), this.chains = /* @__PURE__ */ new Map(), this.defaultFramebufferOptions = {
      width: 0,
      height: 0,
      textureCount: 2,
      textureOptions: {
        minFilter: WebGLRenderingContext.LINEAR,
        magFilter: WebGLRenderingContext.LINEAR
      }
    }, this.webglManager = e;
  }
  registerEffect(e) {
    this.effects.has(e.id) && console.warn(`Effect with id ${e.id} already exists, overwriting`), this.webglManager.resources.has(e.programId) || this.webglManager.createProgram(e.programId, e.shaderConfig), this.effects.set(e.id, e);
  }
  removeEffect(e) {
    if (!this.effects.has(e)) {
      console.warn(`Effect with id ${e} not found`);
      return;
    }
    this.effects.delete(e);
  }
  createChain(e, a, t, r = null, n = this.defaultFramebufferOptions) {
    this.chains.has(e) && console.warn(`Chain with id ${e} already exists, overwriting`);
    const s = [];
    for (const o of a) {
      const f = this.effects.get(o);
      if (!f)
        throw new Error(`Effect with id ${o} not found`);
      s.push(f);
    }
    const i = [];
    for (let o = 0; o < s.length - 1; o++) {
      const f = `${e}-intermediate-${o}`;
      this.webglManager.fbo.createFramebuffer(f, n), i.push(f);
    }
    this.chains.set(e, {
      id: e,
      effects: s,
      inputFramebufferId: t,
      outputFramebufferId: r,
      intermediateFramebufferIds: i
    });
  }
  removeChain(e) {
    const a = this.chains.get(e);
    if (!a) {
      console.warn(`Chain with id ${e} not found`);
      return;
    }
    a.intermediateFramebufferIds.forEach((t) => {
      this.webglManager.fbo.destroy(t);
    }), this.chains.delete(e);
  }
  generatePasses(e, a) {
    const t = this.chains.get(e);
    if (!t)
      throw new Error(`Chain with id ${e} not found`);
    const r = [], n = t.effects.filter((s) => s.enabled);
    return n.length === 0 ? [{
      programId: "copy-shader",
      // Assuming you have a simple copy shader
      inputTextures: [{
        id: t.inputFramebufferId,
        textureUnit: 0,
        bindingType: "read"
      }],
      outputFramebuffer: t.outputFramebufferId,
      renderOptions: { clear: !0 }
    }] : (n.forEach((s, i) => {
      const o = i === 0, f = i === n.length - 1, c = o ? t.inputFramebufferId : t.intermediateFramebufferIds[i - 1], g = f ? t.outputFramebufferId : t.intermediateFramebufferIds[i], d = {};
      Object.entries(s.uniforms).forEach(([h, b]) => {
        const p = h.startsWith("u_") ? h : `u_${h}`, u = b;
        d[p] = {
          type: u.type,
          value: typeof u.value == "function" ? (l, m, w) => {
            const F = u.value;
            return F(l, m, w);
          } : u.value
        };
      }), r.push({
        programId: s.programId,
        inputTextures: [{
          id: c,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: g,
        uniforms: d,
        renderOptions: { clear: !0 }
      });
    }), r);
  }
  process(e, a) {
    const t = this.generatePasses(e, a);
    for (const r of t)
      r.outputFramebuffer ? this.webglManager.fbo.bindFramebuffer(r.outputFramebuffer) : this.webglManager.fbo.bindFramebuffer(null), this.webglManager.prepareRender(r.programId, r.renderOptions), r.inputTextures.forEach((n) => {
        this.webglManager.fbo.bindTexture(n.id, n.textureUnit), this.webglManager.setUniform(
          r.programId,
          `u_texture${n.textureUnit}`,
          n.textureUnit,
          "sampler2D"
        );
      }), r.uniforms && Object.entries(r.uniforms).forEach(([n, s]) => {
        const i = typeof s.value == "function" ? s.value(a, this.webglManager.context.canvas.width, this.webglManager.context.canvas.height) : s.value;
        this.webglManager.setUniform(
          r.programId,
          n,
          i,
          s.type
        );
      }), this.webglManager.context.drawArrays(
        this.webglManager.context.TRIANGLE_STRIP,
        0,
        4
      );
  }
  resizeFramebuffers(e, a) {
    for (const t of this.chains.values())
      for (const r of t.intermediateFramebufferIds)
        this.webglManager.fbo.resizeFramebuffer(r, e, a);
  }
  destroyAll() {
    for (const e of this.chains.values())
      for (const a of e.intermediateFramebufferIds)
        this.webglManager.fbo.destroy(a);
    this.chains.clear(), this.effects.clear();
  }
}
export {
  L as BasePingPongShaderComponent,
  W as BaseShaderComponent,
  v as FBOManager,
  R as Passes,
  S as PingPongShaderEngine,
  I as Postprocessing,
  _ as ShaderEngine,
  y as WebGLManager,
  P as createCommonUpdaters,
  U as createShaderConfig,
  C as createUniformUpdater,
  $ as createUniformUpdaters,
  G as useDarkMode,
  A as usePingPongPasses,
  O as useUniformUpdaters
};
