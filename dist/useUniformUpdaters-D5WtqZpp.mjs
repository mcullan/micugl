import { useMemo as g } from "react";
class w {
  constructor(s) {
    this.resources = /* @__PURE__ */ new Map(), this.floatTextureExtension = null, this.gl = s, this.floatTextureExtension = s.getExtension("OES_texture_float"), this.floatTexturesSupported = !!this.floatTextureExtension, s.getExtension("OES_texture_float_linear");
  }
  createFramebuffer(s, e) {
    const t = this.gl, { width: r, height: o, textureCount: a = 2, textureOptions: i = {} } = e, c = [];
    for (let h = 0; h < a; h++) {
      const l = this.createTexture({
        width: r,
        height: o,
        ...i
      });
      c.push(l);
    }
    const u = t.createFramebuffer();
    if (!u)
      throw new Error("Failed to create framebuffer");
    const f = {
      framebuffer: u,
      textures: c,
      currentTextureIndex: 0,
      width: r,
      height: o
    };
    return this.resources.set(s, f), f;
  }
  createTexture(s) {
    const e = this.gl, {
      width: t,
      height: r,
      internalFormat: o = e.RGBA,
      format: a = e.RGBA,
      type: i = this.floatTexturesSupported ? e.FLOAT : e.UNSIGNED_BYTE,
      minFilter: c = e.NEAREST,
      magFilter: u = e.NEAREST,
      wrapS: f = e.CLAMP_TO_EDGE,
      wrapT: h = e.CLAMP_TO_EDGE,
      generateMipmap: l = !1
    } = s, n = e.createTexture();
    if (!n)
      throw new Error("Failed to create texture");
    return e.bindTexture(e.TEXTURE_2D, n), e.texImage2D(e.TEXTURE_2D, 0, o, t, r, 0, a, i, null), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, c), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, u), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, f), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, h), l && e.generateMipmap(e.TEXTURE_2D), n;
  }
  bindFramebuffer(s, e) {
    const t = this.gl;
    if (s === null) {
      t.bindFramebuffer(t.FRAMEBUFFER, null);
      return;
    }
    const r = this.resources.get(s);
    if (!r)
      throw new Error(`Framebuffer with id ${s} not found`);
    const o = e ?? r.currentTextureIndex;
    t.bindFramebuffer(t.FRAMEBUFFER, r.framebuffer), t.framebufferTexture2D(
      t.FRAMEBUFFER,
      t.COLOR_ATTACHMENT0,
      t.TEXTURE_2D,
      r.textures[o],
      0
    );
    const a = t.checkFramebufferStatus(t.FRAMEBUFFER);
    if (a !== t.FRAMEBUFFER_COMPLETE)
      throw new Error(`Framebuffer is not complete: ${a}`);
  }
  bindTexture(s, e, t) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Framebuffer with id ${s} not found`);
    const a = t ?? o.currentTextureIndex;
    r.activeTexture(r.TEXTURE0 + e), r.bindTexture(r.TEXTURE_2D, o.textures[a]);
  }
  swapTextures(s) {
    const e = this.resources.get(s);
    if (!e)
      throw new Error(`Framebuffer with id ${s} not found`);
    e.currentTextureIndex = (e.currentTextureIndex + 1) % e.textures.length;
  }
  getPingPongIndices(s) {
    const e = this.resources.get(s);
    if (!e)
      throw new Error(`Framebuffer with id ${s} not found`);
    const t = e.currentTextureIndex, r = (t + 1) % e.textures.length;
    return { read: t, write: r };
  }
  resizeFramebuffer(s, e, t) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Framebuffer with id ${s} not found`);
    o.width === e && o.height === t || (o.textures.forEach((a) => {
      r.bindTexture(r.TEXTURE_2D, a), r.texImage2D(
        r.TEXTURE_2D,
        0,
        r.RGBA,
        e,
        t,
        0,
        r.RGBA,
        this.floatTexturesSupported ? r.FLOAT : r.UNSIGNED_BYTE,
        null
      );
    }), o.width = e, o.height = t);
  }
  destroy(s) {
    const e = this.gl, t = this.resources.get(s);
    t && (t.textures.forEach((r) => {
      e.deleteTexture(r);
    }), e.deleteFramebuffer(t.framebuffer), this.resources.delete(s));
  }
  destroyAll() {
    Array.from(this.resources.keys()).forEach((s) => {
      this.destroy(s);
    });
  }
  isFloatTexturesSupported() {
    return this.floatTexturesSupported;
  }
}
class T {
  constructor(s, e) {
    this.resources = /* @__PURE__ */ new Map(), this.compileCache = /* @__PURE__ */ new Map(), this.uniformUpdateFns = /* @__PURE__ */ new Map(), this.extensions = /* @__PURE__ */ new Map();
    const t = {
      alpha: !1,
      depth: !1,
      stencil: !1,
      antialias: !1,
      powerPreference: "low-power",
      preserveDrawingBuffer: !1
    }, r = s.getContext("webgl", { ...t, ...e });
    if (!r)
      throw new Error("WebGL not supported");
    this.gl = r, this.fboManager = new w(r), this.getExtension("OES_texture_float"), this.getExtension("OES_texture_float_linear"), this.getExtension("OES_vertex_array_object"), this.getExtension("ANGLE_instanced_arrays");
  }
  getExtension(s) {
    if (this.extensions.has(s))
      return this.extensions.get(s);
    const e = this.gl.getExtension(s);
    return this.extensions.set(s, e), e;
  }
  createProgram(s, e) {
    const { vertexShader: t, fragmentShader: r, uniforms: o, attributes: a } = e, i = this.gl, c = this.getOrCompileShader("vertex:" + t, i.VERTEX_SHADER, t), u = this.getOrCompileShader("fragment:" + r, i.FRAGMENT_SHADER, r), f = i.createProgram();
    if (!f)
      throw new Error("Failed to create WebGL program");
    if (i.attachShader(f, c), i.attachShader(f, u), i.linkProgram(f), !i.getProgramParameter(f, i.LINK_STATUS)) {
      const d = i.getProgramInfoLog(f);
      throw i.deleteProgram(f), new Error(`Could not link shader program: ${d}`);
    }
    const h = {};
    for (const d of o)
      h[d.name] = i.getUniformLocation(f, d.name);
    const l = {};
    if (a)
      for (const d of a)
        l[d.name] = i.getAttribLocation(f, d.name);
    const n = {
      program: f,
      uniforms: h,
      attributes: l,
      buffers: {}
    };
    return this.resources.set(s, n), this.uniformUpdateFns.set(s, /* @__PURE__ */ new Map()), n;
  }
  getOrCompileShader(s, e, t) {
    if (this.compileCache.has(s)) {
      const o = this.compileCache.get(s);
      if (o)
        return o;
    }
    const r = this.compileShader(e, t);
    return this.compileCache.set(s, r), r;
  }
  compileShader(s, e) {
    const t = this.gl, r = t.createShader(s);
    if (!r)
      throw new Error("Failed to create shader");
    if (t.shaderSource(r, e), t.compileShader(r), !t.getShaderParameter(r, t.COMPILE_STATUS)) {
      const o = t.getShaderInfoLog(r);
      throw t.deleteShader(r), new Error(`Shader compilation failed: ${o}`);
    }
    return r;
  }
  createBuffer(s, e, t) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Program with id ${s} not found`);
    const a = r.createBuffer();
    if (!a)
      throw new Error("Failed to create buffer");
    return r.bindBuffer(r.ARRAY_BUFFER, a), r.bufferData(r.ARRAY_BUFFER, t, r.STATIC_DRAW), o.buffers[e] = { buffer: a, data: t }, a;
  }
  updateBuffer(s, e, t) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Program with id ${s} not found`);
    const a = o.buffers[e];
    if (!a)
      throw new Error(`Buffer for attribute ${e} not found`);
    r.bindBuffer(r.ARRAY_BUFFER, a.buffer), r.bufferData(r.ARRAY_BUFFER, t, r.STATIC_DRAW), a.data = t;
  }
  registerUniformUpdater(s, e, t, r) {
    const o = this.resources.get(s);
    if (!o)
      throw new Error(`Program with id ${s} not found`);
    const a = this.uniformUpdateFns.get(s);
    if (!a)
      throw new Error(`Program uniforms for id ${s} not found`);
    const i = o.uniforms[e];
    if (i === null)
      return;
    const c = this.gl;
    let u;
    switch (t) {
      case "float":
        u = (f, h, l) => {
          const n = r(f, h, l);
          return c.uniform1f(i, n), n;
        };
        break;
      case "vec2":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniform2fv(i, n), n;
        };
        break;
      case "vec3":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniform3fv(i, n), n;
        };
        break;
      case "vec4":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniform4fv(i, n), n;
        };
        break;
      case "int":
        u = (f, h, l) => {
          const n = r(f, h, l);
          return c.uniform1i(i, n), n;
        };
        break;
      case "mat2":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniformMatrix2fv(i, !1, n), n;
        };
        break;
      case "mat3":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniformMatrix3fv(i, !1, n), n;
        };
        break;
      case "mat4":
        u = (f, h, l) => {
          let n = r(f, h, l);
          return Array.isArray(n) && (n = new Float32Array(n)), c.uniformMatrix4fv(i, !1, n), n;
        };
        break;
      case "sampler2D":
        u = (f, h, l) => {
          const n = r(f, h, l);
          return c.uniform1i(i, n), n;
        };
        break;
      default:
        throw new Error(`Unsupported uniform type: ${t}`);
    }
    a.set(e, u);
  }
  updateUniforms(s, e) {
    const t = this.uniformUpdateFns.get(s);
    if (!t)
      return;
    const r = this.gl.canvas, o = r.width, a = r.height;
    t.forEach((i) => {
      i(e, o, a);
    });
  }
  setSize(s, e, t = !0) {
    const r = this.gl.canvas, o = t && window.devicePixelRatio || 1, a = Math.floor(s * o), i = Math.floor(e * o);
    (r.width !== a || r.height !== i) && (r.width = a, r.height = i, r.style.width = `${s}px`, r.style.height = `${e}px`, this.gl.viewport(0, 0, a, i));
  }
  prepareRender(s, e = {}) {
    const { clear: t = !0, clearColor: r = [0, 0, 0, 1] } = e, o = this.gl, a = this.resources.get(s);
    if (!a)
      throw new Error(`Program with id ${s} not found`);
    o.useProgram(a.program), t && (o.clearColor(...r), o.clear(o.COLOR_BUFFER_BIT));
  }
  fastRender(s, e, t = !0) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Program with id ${s} not found`);
    r.useProgram(o.program), t && r.clear(r.COLOR_BUFFER_BIT), this.updateUniforms(s, e);
  }
  setUniform(s, e, t, r) {
    const o = this.gl, a = this.resources.get(s);
    if (!a)
      throw new Error(`Program with id ${s} not found`);
    const i = a.uniforms[e];
    if (i !== null)
      switch (o.useProgram(a.program), r) {
        case "float":
          o.uniform1f(i, t);
          break;
        case "vec2":
          o.uniform2fv(i, t);
          break;
        case "vec3":
          o.uniform3fv(i, t);
          break;
        case "vec4":
          o.uniform4fv(i, t);
          break;
        case "int":
          o.uniform1i(i, t);
          break;
        case "mat2":
          o.uniformMatrix2fv(i, !1, t);
          break;
        case "mat3":
          o.uniformMatrix3fv(i, !1, t);
          break;
        case "mat4":
          o.uniformMatrix4fv(i, !1, t);
          break;
        case "sampler2D":
          o.uniform1i(i, t);
          break;
        default:
          throw new Error(`Unsupported uniform type: ${r}`);
      }
  }
  setAttributeOnce(s, e, t) {
    const r = this.gl, o = this.resources.get(s);
    if (!o)
      throw new Error(`Program with id ${s} not found`);
    const a = o.attributes[e];
    if (a === -1) {
      console.warn(`Attribute ${e} not found or is unused`);
      return;
    }
    const i = o.buffers[e];
    if (!i)
      throw new Error(`Buffer for attribute ${e} not found`);
    if (r.bindBuffer(r.ARRAY_BUFFER, i.buffer), r.enableVertexAttribArray(a), r.vertexAttribPointer(
      a,
      t.size,
      r[t.type],
      t.normalized,
      t.stride,
      t.offset
    ), t.instanced) {
      const c = this.getExtension("ANGLE_instanced_arrays");
      if (c != null && c.vertexAttribDivisorANGLE)
        c.vertexAttribDivisorANGLE(a, 1);
      else if (r.vertexAttribDivisor)
        r.vertexAttribDivisor(a, 1);
      else
        throw new Error("Instanced rendering not supported");
    }
  }
  drawArrays(s, e, t) {
    this.gl.drawArrays(s, e, t);
  }
  drawElements(s, e, t, r) {
    this.gl.drawElements(s, e, t, r);
  }
  destroy(s) {
    const e = this.gl, t = this.resources.get(s);
    t && (Object.values(t.buffers).forEach(({ buffer: r }) => {
      e.deleteBuffer(r);
    }), e.deleteProgram(t.program), this.resources.delete(s), this.uniformUpdateFns.delete(s));
  }
  destroyAll() {
    for (const s of Array.from(this.resources.keys()))
      this.destroy(s);
    this.compileCache.clear(), this.fboManager.destroyAll();
  }
  get context() {
    return this.gl;
  }
  get fbo() {
    return this.fboManager;
  }
}
const A = (m) => {
  const { vertexShader: s, fragmentShader: e, uniformNames: t = {}, attributeConfigs: r = [] } = m, a = { ...{
    u_time: "float",
    u_resolution: "vec2"
  }, ...t }, i = Object.entries(a).map(([u, f]) => ({
    name: u,
    type: f
  })), c = r.map((u) => ({
    name: u.name,
    size: u.size,
    type: u.type,
    normalized: u.normalized ?? !1,
    stride: u.stride ?? 0,
    offset: u.offset ?? 0,
    instanced: u.instanced
  }));
  return c.some((u) => u.name === "a_position") || c.push({
    name: "a_position",
    size: 2,
    type: "FLOAT",
    normalized: !1,
    stride: 0,
    offset: 0,
    instanced: !1
  }), {
    vertexShader: s,
    fragmentShader: e,
    uniforms: i,
    attributes: c
  };
};
function E(m, s, e) {
  return {
    name: m,
    type: s,
    updateFn: typeof e == "function" ? e : (t) => e
  };
}
function p(m) {
  return m.map(
    ({ name: s, type: e, value: t }) => E(s, e, t)
  );
}
function x() {
  return [
    E("u_time", "float", (m) => m * 1e-3),
    E(
      "u_resolution",
      "vec2",
      (m, s = 0, e = 0) => new Float32Array([s, e])
    )
  ];
}
const _ = (m, s) => g(() => {
  const e = x();
  return Object.entries(s).forEach(([t, r]) => {
    const o = t.startsWith("u_") ? t : `u_${t}`;
    e.push(E(o, r.type, r.value));
  }), { [m]: e };
}, [m, s]);
export {
  w as F,
  T as W,
  x as a,
  E as b,
  A as c,
  p as d,
  _ as u
};
