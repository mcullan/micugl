import { jsx as w } from "react/jsx-runtime";
import { useRef as v, useEffect as D } from "react";
import { createShaderConfig as h } from "../../src/core/lib/createShaderConfig.mjs";
import { vec3 as p, vec2 as M } from "../../src/core/lib/vectorUtils.mjs";
import { BasePingPongShaderComponent as O } from "../../src/react/components/base/BasePingPongShaderComponent.mjs";
import { rippleVertexShader as f, rippleSimulationShader as B, rippleRenderShader as F } from "./rippleShaders.mjs";
const I = [0.1, 0.3, 0.1], N = [0.3, 0.2, 0.4], G = ({
  damping: g = 0.99,
  mouseForce: L = 0.5,
  color1: E = I,
  color2: x = N,
  iterations: C = 2,
  className: S = "",
  style: _
}) => {
  const c = v([0.5, 0.5]), n = v(!1), R = h({
    vertexShader: f,
    fragmentShader: B,
    uniformNames: {
      u_texture0: "sampler2D",
      u_mouse: "vec2",
      u_mouseForce: "float",
      u_damping: "float"
    }
  }), y = h({
    vertexShader: f,
    fragmentShader: F,
    uniformNames: {
      u_texture0: "sampler2D",
      u_color1: "vec3",
      u_color2: "vec3"
    }
  });
  return D(() => {
    const s = (e) => {
      const t = e.target.getBoundingClientRect(), o = (e.clientX - t.left) / t.width, r = 1 - (e.clientY - t.top) / t.height;
      c.current = [o, r];
    }, u = () => {
      n.current = !0;
    }, a = () => {
      n.current = !1;
    }, i = (e) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const t = e.target.getBoundingClientRect(), o = (e.touches[0].clientX - t.left) / t.width, r = 1 - (e.touches[0].clientY - t.top) / t.height;
        c.current = [o, r], n.current = !0;
      }
    }, d = (e) => {
      if (e.touches.length > 0 && n.current) {
        e.preventDefault();
        const t = e.target.getBoundingClientRect(), o = (e.touches[0].clientX - t.left) / t.width, r = 1 - (e.touches[0].clientY - t.top) / t.height;
        c.current = [o, r];
      }
    }, m = () => {
      n.current = !1;
    };
    return document.addEventListener("mousemove", s), document.addEventListener("mousedown", u), document.addEventListener("mouseup", a), document.addEventListener("touchstart", i, { passive: !1 }), document.addEventListener("touchmove", d, { passive: !1 }), document.addEventListener("touchend", m), () => {
      document.removeEventListener("mousemove", s), document.removeEventListener("mousedown", u), document.removeEventListener("mouseup", a), document.removeEventListener("touchstart", i), document.removeEventListener("touchmove", d), document.removeEventListener("touchend", m);
    };
  }, []), /* @__PURE__ */ w(
    O,
    {
      programId: "ripple-simulation",
      shaderConfig: R,
      secondaryProgramId: "ripple-render",
      secondaryShaderConfig: y,
      iterations: C,
      className: S,
      style: _,
      framebufferOptions: {
        width: 0,
        height: 0,
        textureCount: 2,
        textureOptions: {
          minFilter: WebGLRenderingContext.LINEAR,
          magFilter: WebGLRenderingContext.LINEAR
        }
      },
      uniforms: {
        u_mouse: {
          type: "vec2",
          value: M(c.current)
        },
        u_mouseForce: {
          type: "float",
          value: () => n.current ? L : 0
        },
        u_damping: {
          type: "float",
          value: g
        }
      },
      secondaryUniforms: {
        u_color1: {
          type: "vec3",
          value: p(E)
        },
        u_color2: {
          type: "vec3",
          value: p(x)
        }
      }
    }
  );
};
export {
  G as Ripple,
  G as default
};
