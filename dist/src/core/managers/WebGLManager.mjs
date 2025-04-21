import { FBOManager as d } from "./FBOManager.mjs";
class b {
  constructor(t, n) {
    this.resources = /* @__PURE__ */ new Map(), this.compileCache = /* @__PURE__ */ new Map(), this.uniformUpdateFns = /* @__PURE__ */ new Map(), this.extensions = /* @__PURE__ */ new Map();
    const e = {
      alpha: !1,
      depth: !1,
      stencil: !1,
      antialias: !1,
      powerPreference: "low-power",
      preserveDrawingBuffer: !1
    }, r = t.getContext("webgl", { ...e, ...n });
    if (!r)
      throw new Error("WebGL not supported");
    this.gl = r, this.fboManager = new d(r), this.getExtension("OES_texture_float"), this.getExtension("OES_texture_float_linear"), this.getExtension("OES_vertex_array_object"), this.getExtension("ANGLE_instanced_arrays");
  }
  getExtension(t) {
    if (this.extensions.has(t))
      return this.extensions.get(t);
    const n = this.gl.getExtension(t);
    return this.extensions.set(t, n), n;
  }
  createProgram(t, n) {
    const { vertexShader: e, fragmentShader: r, uniforms: o, attributes: i } = n, s = this.gl, u = this.getOrCompileShader("vertex:" + e, s.VERTEX_SHADER, e), l = this.getOrCompileShader("fragment:" + r, s.FRAGMENT_SHADER, r), f = s.createProgram();
    if (!f)
      throw new Error("Failed to create WebGL program");
    if (s.attachShader(f, u), s.attachShader(f, l), s.linkProgram(f), !s.getProgramParameter(f, s.LINK_STATUS)) {
      const g = s.getProgramInfoLog(f);
      throw s.deleteProgram(f), new Error(`Could not link shader program: ${g}`);
    }
    const c = {};
    for (const g of o)
      c[g.name] = s.getUniformLocation(f, g.name);
    const h = {};
    if (i)
      for (const g of i)
        h[g.name] = s.getAttribLocation(f, g.name);
    const a = {
      program: f,
      uniforms: c,
      attributes: h,
      buffers: {}
    };
    return this.resources.set(t, a), this.uniformUpdateFns.set(t, /* @__PURE__ */ new Map()), a;
  }
  getOrCompileShader(t, n, e) {
    if (this.compileCache.has(t)) {
      const o = this.compileCache.get(t);
      if (o)
        return o;
    }
    const r = this.compileShader(n, e);
    return this.compileCache.set(t, r), r;
  }
  compileShader(t, n) {
    const e = this.gl, r = e.createShader(t);
    if (!r)
      throw new Error("Failed to create shader");
    if (e.shaderSource(r, n), e.compileShader(r), !e.getShaderParameter(r, e.COMPILE_STATUS)) {
      const o = e.getShaderInfoLog(r);
      throw e.deleteShader(r), new Error(`Shader compilation failed: ${o}`);
    }
    return r;
  }
  createBuffer(t, n, e) {
    const r = this.gl, o = this.resources.get(t);
    if (!o)
      throw new Error(`Program with id ${t} not found`);
    const i = r.createBuffer();
    if (!i)
      throw new Error("Failed to create buffer");
    return r.bindBuffer(r.ARRAY_BUFFER, i), r.bufferData(r.ARRAY_BUFFER, e, r.STATIC_DRAW), o.buffers[n] = { buffer: i, data: e }, i;
  }
  updateBuffer(t, n, e) {
    const r = this.gl, o = this.resources.get(t);
    if (!o)
      throw new Error(`Program with id ${t} not found`);
    const i = o.buffers[n];
    if (!i)
      throw new Error(`Buffer for attribute ${n} not found`);
    r.bindBuffer(r.ARRAY_BUFFER, i.buffer), r.bufferData(r.ARRAY_BUFFER, e, r.STATIC_DRAW), i.data = e;
  }
  registerUniformUpdater(t, n, e, r) {
    const o = this.resources.get(t);
    if (!o)
      throw new Error(`Program with id ${t} not found`);
    const i = this.uniformUpdateFns.get(t);
    if (!i)
      throw new Error(`Program uniforms for id ${t} not found`);
    const s = o.uniforms[n];
    if (s === null)
      return;
    const u = this.gl;
    let l;
    switch (e) {
      case "int":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform1i(s, a), a;
        };
        break;
      case "float":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform1f(s, a), a;
        };
        break;
      case "sampler2D":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform1i(s, a), a;
        };
        break;
      case "vec2":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform2fv(s, a), a;
        };
        break;
      case "vec3":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform3fv(s, a), a;
        };
        break;
      case "vec4":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniform4fv(s, a), a;
        };
        break;
      case "mat2":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniformMatrix2fv(s, !1, a), a;
        };
        break;
      case "mat3":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniformMatrix3fv(s, !1, a), a;
        };
        break;
      case "mat4":
        l = (f, c, h) => {
          const a = r(f, c, h);
          return u.uniformMatrix4fv(s, !1, a), a;
        };
        break;
      default:
        throw new Error(`Unsupported uniform type: ${e}`);
    }
    i.set(n, l);
  }
  updateUniforms(t, n) {
    const e = this.uniformUpdateFns.get(t);
    if (!e)
      return;
    const r = this.gl.canvas, o = r.width, i = r.height;
    e.forEach((s) => {
      s(n, o, i);
    });
  }
  setSize(t, n, e = !0) {
    const r = this.gl.canvas, o = e && window.devicePixelRatio || 1, i = Math.floor(t * o), s = Math.floor(n * o);
    (r.width !== i || r.height !== s) && (r.width = i, r.height = s, r.style.width = `${t}px`, r.style.height = `${n}px`, this.gl.viewport(0, 0, i, s));
  }
  prepareRender(t, n = {}) {
    const { clear: e = !0, clearColor: r = [0, 0, 0, 1] } = n, o = this.gl, i = this.resources.get(t);
    if (!i)
      throw new Error(`Program with id ${t} not found`);
    o.useProgram(i.program), e && (o.clearColor(...r), o.clear(o.COLOR_BUFFER_BIT));
  }
  fastRender(t, n, e = !0) {
    const r = this.gl, o = this.resources.get(t);
    if (!o)
      throw new Error(`Program with id ${t} not found`);
    r.useProgram(o.program), e && r.clear(r.COLOR_BUFFER_BIT), this.updateUniforms(t, n);
  }
  setUniform(t, n, e, r) {
    const o = this.gl, i = this.resources.get(t);
    if (!i)
      throw new Error(`Program with id ${t} not found`);
    const s = i.uniforms[n];
    if (s !== null)
      switch (o.useProgram(i.program), r) {
        case "float":
          o.uniform1f(s, e);
          break;
        case "vec2":
          o.uniform2fv(s, e);
          break;
        case "vec3":
          o.uniform3fv(s, e);
          break;
        case "vec4":
          o.uniform4fv(s, e);
          break;
        case "int":
          o.uniform1i(s, e);
          break;
        case "mat2":
          o.uniformMatrix2fv(s, !1, e);
          break;
        case "mat3":
          o.uniformMatrix3fv(s, !1, e);
          break;
        case "mat4":
          o.uniformMatrix4fv(s, !1, e);
          break;
        case "sampler2D":
          o.uniform1i(s, e);
          break;
        default:
          throw new Error(`Unsupported uniform type: ${r}`);
      }
  }
  setAttributeOnce(t, n, e) {
    const r = this.gl, o = this.resources.get(t);
    if (!o)
      throw new Error(`Program with id ${t} not found`);
    const i = o.attributes[n];
    if (i === -1) {
      console.warn(`Attribute ${n} not found or is unused`);
      return;
    }
    const s = o.buffers[n];
    if (!s)
      throw new Error(`Buffer for attribute ${n} not found`);
    if (r.bindBuffer(r.ARRAY_BUFFER, s.buffer), r.enableVertexAttribArray(i), r.vertexAttribPointer(
      i,
      e.size,
      r[e.type],
      e.normalized,
      e.stride,
      e.offset
    ), e.instanced) {
      const u = this.getExtension("ANGLE_instanced_arrays");
      if (u != null && u.vertexAttribDivisorANGLE)
        u.vertexAttribDivisorANGLE(i, 1);
      else if (r.vertexAttribDivisor)
        r.vertexAttribDivisor(i, 1);
      else
        throw new Error("Instanced rendering not supported");
    }
  }
  drawArrays(t, n, e) {
    this.gl.drawArrays(t, n, e);
  }
  drawElements(t, n, e, r) {
    this.gl.drawElements(t, n, e, r);
  }
  destroy(t) {
    const n = this.gl, e = this.resources.get(t);
    e && (Object.values(e.buffers).forEach(({ buffer: r }) => {
      n.deleteBuffer(r);
    }), n.deleteProgram(e.program), this.resources.delete(t), this.uniformUpdateFns.delete(t));
  }
  destroyAll() {
    for (const t of Array.from(this.resources.keys()))
      this.destroy(t);
    this.compileCache.clear(), this.fboManager.destroyAll();
  }
  get context() {
    return this.gl;
  }
  get fbo() {
    return this.fboManager;
  }
}
export {
  b as WebGLManager
};
