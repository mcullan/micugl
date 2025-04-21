import { vec2 as i } from "../../core/lib/vectorUtils.mjs";
function n(e, r, t) {
  return {
    name: e,
    type: r,
    updateFn: typeof t == "function" ? t : (o) => t
  };
}
function c(e) {
  return e.map(
    ({ name: r, type: t, value: o }) => n(r, t, o)
  );
}
function f() {
  return [
    n("u_time", "float", (e) => (e ?? 0) * 1e-3),
    n(
      "u_resolution",
      "vec2",
      (e, r, t) => i([r ?? 0, t ?? 0])
    )
  ];
}
export {
  f as createCommonUpdaters,
  n as createUniformUpdater,
  c as createUniformUpdaters
};
