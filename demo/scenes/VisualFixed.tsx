import { useEffect, useRef } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { ShaderHandle, UniformParam } from '../../src/types';
import { getFloatQuery } from './query';
import { QUAD_VERTEX, WAVE_FRAGMENT } from './shaders';

declare global {
    interface Window {
        __visualHandle?: ShaderHandle;
    }
}

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WAVE_FRAGMENT
});

const uniforms: Record<string, UniformParam> = {};

export const VisualFixed = () => {
    const handleRef = useRef<ShaderHandle>(null);
    const frame = getFloatQuery('frame', 0);

    useEffect(() => {
        window.__visualHandle = handleRef.current ?? undefined;
        handleRef.current?.setFrame(frame);
        return () => {
            window.__visualHandle = undefined;
        };
    }, [frame]);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <BaseShaderComponent
                ref={handleRef}
                programId='visual-fixed'
                shaderConfig={config}
                uniforms={uniforms}
                width={640}
                height={360}
                useDevicePixelRatio={false}
                frameloop='never'
                reducedMotion='ignore'
                saveData='ignore'
                style={{ width: '640px', height: '360px', display: 'block' }}
            />
        </div>
    );
};
