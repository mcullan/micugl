import { useMemo as c } from "react";
import { createCommonUpdaters as n, createUniformUpdater as p } from "../lib/createUniformUpdater.mjs";
const a = (e, r) => c(() => {
  const o = n();
  return Object.entries(r).forEach(([t, s]) => {
    const u = t.startsWith("u_") ? t : `u_${t}`;
    o.push(p(u, s.type, s.value));
  }), { [e]: o };
}, [e, r]);
export {
  a as useUniformUpdaters
};
