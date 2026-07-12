import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useReducedMotion } from '../../src/react/hooks/useReducedMotion';
import { useSaveData } from '../../src/react/hooks/useSaveData';
import type { MotionPolicy, UniformParam } from '../../src/types';
import { getIntQuery, getQueryString } from './query';
import { QUAD_VERTEX, WAVE_FRAGMENT } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WAVE_FRAGMENT
});

const uniforms: Record<string, UniformParam> = {};

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

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BaseShaderComponent
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
            </div>
        </div>
    );
};
