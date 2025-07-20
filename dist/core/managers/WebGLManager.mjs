var w = Object.defineProperty;
var b = (d, e, o) => e in d ? w(d, e, { enumerable: !0, configurable: !0, writable: !0, value: o }) : d[e] = o;
var m = (d, e, o) => b(d, typeof e != "symbol" ? e + "" : e, o);
import { FBOManager as E } from "./FBOManager.mjs";
class A {
  constructor(e, o) {
    m(this, "gl");
    m(this, "fboManager");
    m(this, "resources", /* @__PURE__ */ new Map());
    m(this, "compileCache", /* @__PURE__ */ new Map());
    m(this, "uniformUpdateFns", /* @__PURE__ */ new Map());
    m(this, "extensions", /* @__PURE__ */ new Map());
    const t = {
      alpha: !1,
      depth: !1,
      stencil: !1,
      antialias: !1,
      powerPreference: "low-power",
      preserveDrawingBuffer: !1
    }, r = e.getContext("webgl", { ...t, ...o });
    if (!r)
      throw new Error("WebGL not supported");
    this.gl = r, this.fboManager = new E(r), this.getExtension("OES_texture_float"), this.getExtension("OES_texture_float_linear"), this.getExtension("OES_vertex_array_object"), this.getExtension("ANGLE_instanced_arrays");
  }
  getExtension(e) {
    if (this.extensions.has(e))
      return this.extensions.get(e);
    const o = this.gl.getExtension(e);
    return this.extensions.set(e, o), o;
  }
  createProgram(e, o) {
    const { vertexShader: t, fragmentShader: r, uniforms: s, attributes: i } = o, n = this.gl, h = this.getOrCompileShader("vertex:" + t, n.VERTEX_SHADER, t), l = this.getOrCompileShader("fragment:" + r, n.FRAGMENT_SHADER, r), f = n.createProgram();
    if (!f)
      throw new Error("Failed to create WebGL program");
    if (n.attachShader(f, h), n.attachShader(f, l), n.linkProgram(f), !n.getProgramParameter(f, n.LINK_STATUS)) {
      const g = n.getProgramInfoLog(f);
      throw n.deleteProgram(f), new Error(`Could not link shader program: ${g}`);
    }
    const c = {};
    for (const g of s)
      c[g.name] = n.getUniformLocation(f, g.name);
    const u = {};
    if (i)
      for (const g of i)
        u[g.name] = n.getAttribLocation(f, g.name);
    const a = {
      program: f,
      uniforms: c,
      attributes: u,
      buffers: {}
    };
    return this.resources.set(e, a), this.uniformUpdateFns.set(e, /* @__PURE__ */ new Map()), a;
  }
  getOrCompileShader(e, o, t) {
    if (this.compileCache.has(e)) {
      const s = this.compileCache.get(e);
      if (s)
        return s;
    }
    const r = this.compileShader(o, t);
    return this.compileCache.set(e, r), r;
  }
  compileShader(e, o) {
    const t = this.gl, r = t.createShader(e);
    if (!r)
      throw new Error("Failed to create shader");
    if (t.shaderSource(r, o), t.compileShader(r), !t.getShaderParameter(r, t.COMPILE_STATUS)) {
      const s = t.getShaderInfoLog(r);
      throw t.deleteShader(r), new Error(`Shader compilation failed: ${s}`);
    }
    return r;
  }
  createBuffer(e, o, t) {
    const r = this.gl, s = this.resources.get(e);
    if (!s)
      throw new Error(`Program with id ${e} not found`);
    const i = r.createBuffer();
    if (!i)
      throw new Error("Failed to create buffer");
    return r.bindBuffer(r.ARRAY_BUFFER, i), r.bufferData(r.ARRAY_BUFFER, t, r.STATIC_DRAW), s.buffers[o] = { buffer: i, data: t }, i;
  }
  updateBuffer(e, o, t) {
    const r = this.gl, s = this.resources.get(e);
    if (!s)
      throw new Error(`Program with id ${e} not found`);
    const i = s.buffers[o];
    if (!i)
      throw new Error(`Buffer for attribute ${o} not found`);
    r.bindBuffer(r.ARRAY_BUFFER, i.buffer), r.bufferData(r.ARRAY_BUFFER, t, r.STATIC_DRAW), i.data = t;
  }
  registerUniformUpdater(e, o, t, r) {
    const s = this.resources.get(e);
    if (!s)
      throw new Error(`Program with id ${e} not found`);
    const i = this.uniformUpdateFns.get(e);
    if (!i)
      throw new Error(`Program uniforms for id ${e} not found`);
    const n = s.uniforms[o];
    if (n === null)
      return;
    const h = this.gl;
    let l;
    switch (t) {
      case "int":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform1i(n, a), a;
        };
        break;
      case "float":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform1f(n, a), a;
        };
        break;
      case "sampler2D":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform1i(n, a), a;
        };
        break;
      case "vec2":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform2fv(n, a), a;
        };
        break;
      case "vec3":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform3fv(n, a), a;
        };
        break;
      case "vec4":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniform4fv(n, a), a;
        };
        break;
      case "mat2":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniformMatrix2fv(n, !1, a), a;
        };
        break;
      case "mat3":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniformMatrix3fv(n, !1, a), a;
        };
        break;
      case "mat4":
        l = (f, c, u) => {
          const a = r(f, c, u);
          return h.uniformMatrix4fv(n, !1, a), a;
        };
        break;
      default:
        throw new Error(`Unsupported uniform type: ${t}`);
    }
    i.set(o, l);
  }
  updateUniforms(e, o) {
    const t = this.uniformUpdateFns.get(e);
    if (!t)
      return;
    const r = this.gl.canvas, s = r.width, i = r.height;
    t.forEach((n) => {
      n(o, s, i);
    });
  }
  setSize(e, o, t = 1) {
    const r = this.gl.canvas, s = Math.floor(e * t), i = Math.floor(o * t);
    (r.width !== s || r.height !== i) && (r.width = s, r.height = i, r.style.width = `${e}px`, r.style.height = `${o}px`, this.gl.viewport(0, 0, s, i));
  }
  prepareRender(e, o = {}) {
    const { clear: t = !0, clearColor: r = [0, 0, 0, 1] } = o, s = this.gl, i = this.resources.get(e);
    if (!i)
      throw new Error(`Program with id ${e} not found`);
    s.useProgram(i.program), t && (s.clearColor(...r), s.clear(s.COLOR_BUFFER_BIT));
  }
  fastRender(e, o, t = !0) {
    const r = this.gl, s = this.resources.get(e);
    if (!s)
      throw new Error(`Program with id ${e} not found`);
    r.useProgram(s.program), t && r.clear(r.COLOR_BUFFER_BIT), this.updateUniforms(e, o);
  }
  setUniform(e, o, t, r) {
    const s = this.gl, i = this.resources.get(e);
    if (!i)
      throw new Error(`Program with id ${e} not found`);
    const n = i.uniforms[o];
    if (n !== null)
      switch (s.useProgram(i.program), r) {
        case "float":
          s.uniform1f(n, t);
          break;
        case "vec2":
          s.uniform2fv(n, t);
          break;
        case "vec3":
          s.uniform3fv(n, t);
          break;
        case "vec4":
          s.uniform4fv(n, t);
          break;
        case "int":
          s.uniform1i(n, t);
          break;
        case "mat2":
          s.uniformMatrix2fv(n, !1, t);
          break;
        case "mat3":
          s.uniformMatrix3fv(n, !1, t);
          break;
        case "mat4":
          s.uniformMatrix4fv(n, !1, t);
          break;
        case "sampler2D":
          s.uniform1i(n, t);
          break;
        default:
          throw new Error(`Unsupported uniform type: ${r}`);
      }
  }
  setAttributeOnce(e, o, t) {
    const r = this.gl, s = this.resources.get(e);
    if (!s)
      throw new Error(`Program with id ${e} not found`);
    const i = s.attributes[o];
    if (i === -1) {
      console.warn(`Attribute ${o} not found or is unused`);
      return;
    }
    const n = s.buffers[o];
    if (!n)
      throw new Error(`Buffer for attribute ${o} not found`);
    if (r.bindBuffer(r.ARRAY_BUFFER, n.buffer), r.enableVertexAttribArray(i), r.vertexAttribPointer(
      i,
      t.size,
      r[t.type],
      t.normalized,
      t.stride,
      t.offset
    ), t.instanced) {
      const h = this.getExtension("ANGLE_instanced_arrays");
      if (h != null && h.vertexAttribDivisorANGLE)
        h.vertexAttribDivisorANGLE(i, 1);
      else if (r.vertexAttribDivisor)
        r.vertexAttribDivisor(i, 1);
      else
        throw new Error("Instanced rendering not supported");
    }
  }
  drawArrays(e, o, t) {
    this.gl.drawArrays(e, o, t);
  }
  drawElements(e, o, t, r) {
    this.gl.drawElements(e, o, t, r);
  }
  destroy(e) {
    const o = this.gl, t = this.resources.get(e);
    t && (Object.values(t.buffers).forEach(({ buffer: r }) => {
      o.deleteBuffer(r);
    }), o.deleteProgram(t.program), this.resources.delete(e), this.uniformUpdateFns.delete(e));
  }
  destroyAll() {
    for (const e of Array.from(this.resources.keys()))
      this.destroy(e);
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
  A as WebGLManager
};
