function n(r) {
  return new Float32Array(r);
}
function o(r) {
  const t = new Float32Array(2);
  return r && t.set(r), t;
}
function e(r) {
  const t = new Float32Array(3);
  return r && t.set(r), t;
}
function a(r) {
  const t = new Float32Array(4);
  return r && t.set(r), t;
}
function c(r) {
  const t = new Float32Array(4);
  return r && t.set(r), t;
}
function f(r) {
  const t = new Float32Array(9);
  return r && t.set(r), t;
}
function i(r) {
  const t = new Float32Array(16);
  return r && t.set(r), t;
}
export {
  n as createTypedFloat32Array,
  c as mat2,
  f as mat3,
  i as mat4,
  o as vec2,
  e as vec3,
  a as vec4
};
