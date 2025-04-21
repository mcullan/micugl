import { useState as c, useEffect as a } from "react";
const d = () => {
  const [o, r] = c(!1);
  return a(() => {
    const t = () => {
      const e = document.documentElement.classList.contains("dark");
      r(e);
    };
    t();
    const s = new MutationObserver((e) => {
      e.forEach((n) => {
        n.attributeName === "class" && t();
      });
    });
    return s.observe(document.documentElement, { attributes: !0 }), () => {
      s.disconnect();
    };
  }, []), o;
};
export {
  d as useDarkMode
};
