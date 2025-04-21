var m = Object.defineProperty;
var w = (u, e, t) => e in u ? m(u, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : u[e] = t;
var h = (u, e, t) => w(u, typeof e != "symbol" ? e + "" : e, t);
class M {
  constructor(e) {
    h(this, "webglManager");
    h(this, "effects", /* @__PURE__ */ new Map());
    h(this, "chains", /* @__PURE__ */ new Map());
    h(this, "defaultFramebufferOptions", {
      width: 0,
      height: 0,
      textureCount: 2,
      textureOptions: {
        minFilter: WebGLRenderingContext.LINEAR,
        magFilter: WebGLRenderingContext.LINEAR
      }
    });
    this.webglManager = e;
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
  createChain(e, t, r, s = null, i = this.defaultFramebufferOptions) {
    this.chains.has(e) && console.warn(`Chain with id ${e} already exists, overwriting`);
    const a = [];
    for (const o of t) {
      const f = this.effects.get(o);
      if (!f)
        throw new Error(`Effect with id ${o} not found`);
      a.push(f);
    }
    const n = [];
    for (let o = 0; o < a.length - 1; o++) {
      const f = `${e}-intermediate-${o}`;
      this.webglManager.fbo.createFramebuffer(f, i), n.push(f);
    }
    this.chains.set(e, {
      id: e,
      effects: a,
      inputFramebufferId: r,
      outputFramebufferId: s,
      intermediateFramebufferIds: n
    });
  }
  removeChain(e) {
    const t = this.chains.get(e);
    if (!t) {
      console.warn(`Chain with id ${e} not found`);
      return;
    }
    t.intermediateFramebufferIds.forEach((r) => {
      this.webglManager.fbo.destroy(r);
    }), this.chains.delete(e);
  }
  generatePasses(e, t) {
    const r = this.chains.get(e);
    if (!r)
      throw new Error(`Chain with id ${e} not found`);
    const s = [], i = r.effects.filter((a) => a.enabled);
    return i.length === 0 ? [{
      programId: "copy-shader",
      inputTextures: [{
        id: r.inputFramebufferId,
        textureUnit: 0,
        bindingType: "read"
      }],
      outputFramebuffer: r.outputFramebufferId,
      renderOptions: { clear: !0 }
    }] : (i.forEach((a, n) => {
      const o = n === 0, f = n === i.length - 1, b = o ? r.inputFramebufferId : r.intermediateFramebufferIds[n - 1], l = f ? r.outputFramebufferId : r.intermediateFramebufferIds[n], d = {};
      Object.entries(a.uniforms).forEach(([c, g]) => {
        const p = c.startsWith("u_") ? c : `u_${c}`;
        d[p] = {
          type: g.type,
          value: g.value
        };
      }), s.push({
        programId: a.programId,
        inputTextures: [{
          id: b,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: l,
        uniforms: d,
        renderOptions: { clear: !0 }
      });
    }), s);
  }
  process(e, t) {
    const r = this.generatePasses(e, t);
    for (const s of r)
      s.outputFramebuffer ? this.webglManager.fbo.bindFramebuffer(s.outputFramebuffer) : this.webglManager.fbo.bindFramebuffer(null), this.webglManager.prepareRender(s.programId, s.renderOptions), s.inputTextures.forEach((i) => {
        this.webglManager.fbo.bindTexture(i.id, i.textureUnit), this.webglManager.setUniform(
          s.programId,
          `u_texture${i.textureUnit}`,
          i.textureUnit,
          "sampler2D"
        );
      }), s.uniforms && Object.entries(s.uniforms).forEach(([i, a]) => {
        const n = typeof a.value == "function" ? a.value(t, this.webglManager.context.canvas.width, this.webglManager.context.canvas.height) : a.value;
        this.webglManager.setUniform(
          s.programId,
          i,
          n,
          a.type
        );
      }), this.webglManager.context.drawArrays(
        this.webglManager.context.TRIANGLE_STRIP,
        0,
        4
      );
  }
  resizeFramebuffers(e, t) {
    for (const r of this.chains.values())
      for (const s of r.intermediateFramebufferIds)
        this.webglManager.fbo.resizeFramebuffer(s, e, t);
  }
  destroyAll() {
    for (const e of this.chains.values())
      for (const t of e.intermediateFramebufferIds)
        this.webglManager.fbo.destroy(t);
    this.chains.clear(), this.effects.clear();
  }
}
export {
  M as Postprocessing
};
