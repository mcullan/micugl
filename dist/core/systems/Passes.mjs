var d = Object.defineProperty;
var p = (t, e, a) => e in t ? d(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var o = (t, e, a) => p(t, typeof e != "symbol" ? e + "" : e, a);
class b {
  constructor(e) {
    o(this, "webglManager");
    o(this, "passes", []);
    o(this, "pingPongIds", /* @__PURE__ */ new Set());
    this.webglManager = e;
  }
  addPass(e) {
    this.passes.push(e), e.outputFramebuffer && this.pingPongIds.add(e.outputFramebuffer), e.inputTextures.forEach((a) => {
      a.bindingType === "readwrite" && this.pingPongIds.add(a.id);
    });
  }
  clearPasses() {
    this.passes = [], this.pingPongIds.clear();
  }
  execute(e) {
    const a = this.webglManager.context, i = this.webglManager.fbo;
    for (const s of this.passes) {
      if (s.outputFramebuffer)
        if (this.pingPongIds.has(s.outputFramebuffer)) {
          const { write: r } = i.getPingPongIndices(s.outputFramebuffer);
          i.bindFramebuffer(s.outputFramebuffer, r);
        } else
          i.bindFramebuffer(s.outputFramebuffer);
      else
        i.bindFramebuffer(null);
      this.webglManager.prepareRender(s.programId, s.renderOptions), s.inputTextures.forEach((r) => {
        let n = r.bindingType === "read" ? 0 : 1;
        if (this.pingPongIds.has(r.id)) {
          const { read: g, write: f } = i.getPingPongIndices(r.id);
          n = r.bindingType === "read" || r.bindingType === "readwrite" ? g : f;
        }
        i.bindTexture(r.id, r.textureUnit, n), this.webglManager.setUniform(
          s.programId,
          `u_${r.id}`,
          r.textureUnit,
          "sampler2D"
        );
      }), this.webglManager.updateUniforms(s.programId, e), s.uniforms && Object.entries(s.uniforms).forEach(([r, n]) => {
        const g = typeof n.value == "function" ? n.value(e, a.canvas.width, a.canvas.height) : n.value;
        this.webglManager.setUniform(
          s.programId,
          r,
          g,
          n.type
        );
      }), a.drawArrays(a.TRIANGLE_STRIP, 0, 4), s.outputFramebuffer && this.pingPongIds.has(s.outputFramebuffer) && i.swapTextures(s.outputFramebuffer), s.inputTextures.forEach((r) => {
        r.bindingType === "readwrite" && this.pingPongIds.has(r.id) && i.swapTextures(r.id);
      });
    }
  }
  initializeResources() {
    for (const e of this.passes) {
      const a = this.webglManager.resources.get(e.programId);
      a && !a.buffers.a_position && (this.webglManager.createBuffer(
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
export {
  b as Passes
};
