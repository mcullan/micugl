import { useEffect, useRef, useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useReducedMotion } from '../../src/react/hooks/useReducedMotion';
import { useSaveData } from '../../src/react/hooks/useSaveData';
import type { MotionPolicy, ShaderHandle, UniformParam } from '../../src/types';
import { getIntQuery, getQueryString } from './query';
import { QUAD_VERTEX } from './shaders';

const TINT_FRAGMENT = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_tint;
    varying vec2 v_uv;
    void main() {
        vec2 uv = v_uv;
        float w = 0.5 + 0.5 * sin(uv.x * 10.0 + u_time);
        float g = 0.5 + 0.5 * cos(uv.y * 10.0 - u_time);
        vec3 base = vec3(w, g, 1.0 - w * g);
        vec3 tint = vec3(u_tint, 1.0 - u_tint, 0.5);
        gl_FragColor = vec4(mix(base, tint, 0.5), 1.0);
    }
`;

const TINTS = [0, 0.25, 0.5, 0.75, 1];

declare global {
    interface Window {
        __reducedMotionHandle?: ShaderHandle;
    }
}

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: TINT_FRAGMENT,
    uniformNames: { u_tint: 'float' }
});

const MOTION_POLICIES: MotionPolicy[] = ['static-frame', 'pause', 'ignore'];

const readPolicy = (): MotionPolicy => {
    const raw = getQueryString('policy');
    if (raw !== null && (MOTION_POLICIES as string[]).includes(raw)) {
        return raw as MotionPolicy;
    }
    return 'static-frame';
};

export const ReducedMotion = () => {
    const reducedMotionActive = useReducedMotion();
    const saveDataActive = useSaveData();
    const policy = readPolicy();
    const staticFrame = getIntQuery('staticFrame', 0);
    const handleRef = useRef<ShaderHandle>(null);
    const [tintIndex, setTintIndex] = useState(0);

    const uniforms: Record<string, UniformParam> = {
        u_tint: { type: 'float', value: TINTS[tintIndex] }
    };

    useEffect(() => {
        window.__reducedMotionHandle = handleRef.current ?? undefined;
        return () => {
            window.__reducedMotionHandle = undefined;
        };
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BaseShaderComponent
                ref={handleRef}
                programId='reduced-motion'
                shaderConfig={config}
                uniforms={uniforms}
                reducedMotion={policy}
                staticFrame={staticFrame}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    borderRadius: '4px',
                    lineHeight: 1.6
                }}
            >
                <div>useReducedMotion(): {String(reducedMotionActive)}</div>
                <div>useSaveData(): {String(saveDataActive)}</div>
                <div>reducedMotion policy: {policy}</div>
                <div>staticFrame: {staticFrame}</div>
                <div>u_tint: {TINTS[tintIndex].toFixed(2)}</div>
                <button
                    type='button'
                    onClick={() => { setTintIndex(index => (index + 1) % TINTS.length) }}
                    style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                >
                    cycle u_tint
                </button>
            </div>
        </div>
    );
};
