var l = Object.defineProperty;
var F = (n, r, e) => r in n ? l(n, r, { enumerable: !0, configurable: !0, writable: !0, value: e }) : n[r] = e;
var i = (n, r, e) => F(n, typeof r != "symbol" ? r + "" : r, e);
class d {
  constructor(r) {
    i(this, "gl");
    i(this, "resources", /* @__PURE__ */ new Map());
    i(this, "floatTexturesSupported");
    i(this, "floatTextureExtension", null);
    this.gl = r, this.floatTextureExtension = r.getExtension("OES_texture_float"), this.floatTexturesSupported = !!this.floatTextureExtension, r.getExtension("OES_texture_float_linear");
  }
  createFramebuffer(r, e) {
    const t = this.gl, { width: s, height: u, textureCount: o = 2, textureOptions: c = {} } = e, f = [];
    for (let T = 0; T < o; T++) {
      const x = this.createTexture({
        width: s,
        height: u,
        ...c
      });
      f.push(x);
    }
    const E = t.createFramebuffer();
    if (!E)
      throw new Error("Failed to create framebuffer");
    const a = {
      framebuffer: E,
      textures: f,
      currentTextureIndex: 0,
      width: s,
      height: u
    };
    return this.resources.set(r, a), a;
  }
  createTexture(r) {
    const e = this.gl, {
      width: t,
      height: s,
      internalFormat: u = e.RGBA,
      format: o = e.RGBA,
      type: c = this.floatTexturesSupported ? e.FLOAT : e.UNSIGNED_BYTE,
      minFilter: f = e.NEAREST,
      magFilter: E = e.NEAREST,
      wrapS: a = e.CLAMP_TO_EDGE,
      wrapT: T = e.CLAMP_TO_EDGE,
      generateMipmap: x = !1
    } = r, h = e.createTexture();
    if (!h)
      throw new Error("Failed to create texture");
    return e.bindTexture(e.TEXTURE_2D, h), e.texImage2D(e.TEXTURE_2D, 0, u, t, s, 0, o, c, null), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, f), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, E), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, a), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, T), x && e.generateMipmap(e.TEXTURE_2D), h;
  }
  bindFramebuffer(r, e) {
    const t = this.gl;
    if (r === null) {
      t.bindFramebuffer(t.FRAMEBUFFER, null);
      return;
    }
    const s = this.resources.get(r);
    if (!s)
      throw new Error(`Framebuffer with id ${r} not found`);
    const u = e ?? s.currentTextureIndex;
    t.bindFramebuffer(t.FRAMEBUFFER, s.framebuffer), t.framebufferTexture2D(
      t.FRAMEBUFFER,
      t.COLOR_ATTACHMENT0,
      t.TEXTURE_2D,
      s.textures[u],
      0
    );
    const o = t.checkFramebufferStatus(t.FRAMEBUFFER);
    if (o !== t.FRAMEBUFFER_COMPLETE)
      throw new Error(`Framebuffer is not complete: ${o}`);
  }
  bindTexture(r, e, t) {
    const s = this.gl, u = this.resources.get(r);
    if (!u)
      throw new Error(`Framebuffer with id ${r} not found`);
    const o = t ?? u.currentTextureIndex;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, u.textures[o]);
  }
  swapTextures(r) {
    const e = this.resources.get(r);
    if (!e)
      throw new Error(`Framebuffer with id ${r} not found`);
    e.currentTextureIndex = (e.currentTextureIndex + 1) % e.textures.length;
  }
  getPingPongIndices(r) {
    const e = this.resources.get(r);
    if (!e)
      throw new Error(`Framebuffer with id ${r} not found`);
    const t = e.currentTextureIndex, s = (t + 1) % e.textures.length;
    return { read: t, write: s };
  }
  resizeFramebuffer(r, e, t) {
    const s = this.gl, u = this.resources.get(r);
    if (!u)
      throw new Error(`Framebuffer with id ${r} not found`);
    u.width === e && u.height === t || (u.textures.forEach((o) => {
      s.bindTexture(s.TEXTURE_2D, o), s.texImage2D(
        s.TEXTURE_2D,
        0,
        s.RGBA,
        e,
        t,
        0,
        s.RGBA,
        this.floatTexturesSupported ? s.FLOAT : s.UNSIGNED_BYTE,
        null
      );
    }), u.width = e, u.height = t);
  }
  destroy(r) {
    const e = this.gl, t = this.resources.get(r);
    t && (t.textures.forEach((s) => {
      e.deleteTexture(s);
    }), e.deleteFramebuffer(t.framebuffer), this.resources.delete(r));
  }
  destroyAll() {
    Array.from(this.resources.keys()).forEach((r) => {
      this.destroy(r);
    });
  }
  isFloatTexturesSupported() {
    return this.floatTexturesSupported;
  }
}
export {
  d as FBOManager
};
