class p {
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
  createChain(e, i, t, r = null, a = this.defaultFramebufferOptions) {
    this.chains.has(e) && console.warn(`Chain with id ${e} already exists, overwriting`);
    const s = [];
    for (const o of i) {
      const f = this.effects.get(o);
      if (!f)
        throw new Error(`Effect with id ${o} not found`);
      s.push(f);
    }
    const n = [];
    for (let o = 0; o < s.length - 1; o++) {
      const f = `${e}-intermediate-${o}`;
      this.webglManager.fbo.createFramebuffer(f, a), n.push(f);
    }
    this.chains.set(e, {
      id: e,
      effects: s,
      inputFramebufferId: t,
      outputFramebufferId: r,
      intermediateFramebufferIds: n
    });
  }
  removeChain(e) {
    const i = this.chains.get(e);
    if (!i) {
      console.warn(`Chain with id ${e} not found`);
      return;
    }
    i.intermediateFramebufferIds.forEach((t) => {
      this.webglManager.fbo.destroy(t);
    }), this.chains.delete(e);
  }
  generatePasses(e, i) {
    const t = this.chains.get(e);
    if (!t)
      throw new Error(`Chain with id ${e} not found`);
    const r = [], a = t.effects.filter((s) => s.enabled);
    return a.length === 0 ? [{
      programId: "copy-shader",
      inputTextures: [{
        id: t.inputFramebufferId,
        textureUnit: 0,
        bindingType: "read"
      }],
      outputFramebuffer: t.outputFramebufferId,
      renderOptions: { clear: !0 }
    }] : (a.forEach((s, n) => {
      const o = n === 0, f = n === a.length - 1, d = o ? t.inputFramebufferId : t.intermediateFramebufferIds[n - 1], g = f ? t.outputFramebufferId : t.intermediateFramebufferIds[n], h = {};
      Object.entries(s.uniforms).forEach(([u, c]) => {
        const b = u.startsWith("u_") ? u : `u_${u}`;
        h[b] = {
          type: c.type,
          value: c.value
        };
      }), r.push({
        programId: s.programId,
        inputTextures: [{
          id: d,
          textureUnit: 0,
          bindingType: "read"
        }],
        outputFramebuffer: g,
        uniforms: h,
        renderOptions: { clear: !0 }
      });
    }), r);
  }
  process(e, i) {
    const t = this.generatePasses(e, i);
    for (const r of t)
      r.outputFramebuffer ? this.webglManager.fbo.bindFramebuffer(r.outputFramebuffer) : this.webglManager.fbo.bindFramebuffer(null), this.webglManager.prepareRender(r.programId, r.renderOptions), r.inputTextures.forEach((a) => {
        this.webglManager.fbo.bindTexture(a.id, a.textureUnit), this.webglManager.setUniform(
          r.programId,
          `u_texture${a.textureUnit}`,
          a.textureUnit,
          "sampler2D"
        );
      }), r.uniforms && Object.entries(r.uniforms).forEach(([a, s]) => {
        const n = typeof s.value == "function" ? s.value(i, this.webglManager.context.canvas.width, this.webglManager.context.canvas.height) : s.value;
        this.webglManager.setUniform(
          r.programId,
          a,
          n,
          s.type
        );
      }), this.webglManager.context.drawArrays(
        this.webglManager.context.TRIANGLE_STRIP,
        0,
        4
      );
  }
  resizeFramebuffers(e, i) {
    for (const t of this.chains.values())
      for (const r of t.intermediateFramebufferIds)
        this.webglManager.fbo.resizeFramebuffer(r, e, i);
  }
  destroyAll() {
    for (const e of this.chains.values())
      for (const i of e.intermediateFramebufferIds)
        this.webglManager.fbo.destroy(i);
    this.chains.clear(), this.effects.clear();
  }
}
export {
  p as Postprocessing
};
