import { useMemo as f } from "react";
import { createCommonUpdaters as c, createUniformUpdater as i } from "../lib/createUniformUpdater.mjs";
const n = (u, t, e) => f(() => {
  const a = (e == null ? void 0 : e.skipDefaultUniforms) ?? !1 ? [] : c().filter(
    (r) => r.name === "u_time" && !("u_time" in t) || r.name === "u_resolution" && !("u_resolution" in t)
  );
  return Object.entries(t).forEach(([r, m]) => {
    const s = r.startsWith("u_") ? r : `u_${r}`;
    a.push(i(s, m.type, m.value));
  }), { [u]: a };
}, [u, t, e == null ? void 0 : e.skipDefaultUniforms]);
export {
  n as useUniformUpdaters
};
