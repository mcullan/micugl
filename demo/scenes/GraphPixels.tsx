import { useEffect } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { shaderNode } from '../../src/core/lib/graphPlanning';
import { ShaderGraph } from '../../src/react/components/ShaderGraph';
import type { EngineHandle } from '../../src/react/devtools/beacon';
import { listEngines } from '../../src/react/devtools/beacon';
import { QUAD_VERTEX } from './shaders';

declare global {
    interface Window {
        __listGraphEngines?: () => EngineHandle[];
    }
}

const A_FRAGMENT = `
    precision highp float;
    varying vec2 v_uv;
    void main() {
        float t = step(0.5, v_uv.y);
        vec3 col = mix(vec3(0.25, 0.0, 0.0), vec3(1.0, 0.0, 0.0), t);
        gl_FragColor = vec4(col, 1.0);
    }
`;

const B_FRAGMENT = `
    precision highp float;
    varying vec2 v_uv;
    void main() {
        gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
    }
`;

const ROOT_FRAGMENT = `
    precision highp float;
    uniform sampler2D u_a;
    uniform sampler2D u_b;
    varying vec2 v_uv;
    void main() {
        vec3 a = texture2D(u_a, v_uv).rgb;
        vec3 b = texture2D(u_b, v_uv).rgb;
        gl_FragColor = vec4(mix(a, b, 0.5), 1.0);
    }
`;

const aConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: A_FRAGMENT,
    uniformNames: {}
});

const bConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: B_FRAGMENT,
    uniformNames: {}
});

const rootConfig = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: ROOT_FRAGMENT,
    uniformNames: {}
});

export const GraphPixels = () => {
    useEffect(() => {
        window.__listGraphEngines = listEngines;
        return () => { window.__listGraphEngines = undefined };
    }, []);

    const a = shaderNode({
        id: 'a',
        shaderConfig: aConfig,
        uniforms: {},
        width: 128,
        height: 128
    });

    const b = shaderNode({
        id: 'b',
        shaderConfig: bConfig,
        uniforms: {},
        width: 128,
        height: 128
    });

    const root = shaderNode({
        id: 'root',
        shaderConfig: rootConfig,
        uniforms: { a, b }
    });

    return (
        <ShaderGraph
            root={root}
            width={256}
            height={256}
            useDevicePixelRatio={false}
            frameloop='always'
            style={{ width: '256px', height: '256px', display: 'block' }}
        />
    );
};
