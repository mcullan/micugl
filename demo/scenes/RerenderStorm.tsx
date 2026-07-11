import { useEffect, useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec2 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import { PLASMA_FRAGMENT, QUAD_VERTEX } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: PLASMA_FRAGMENT,
    uniformNames: {
        u_offset: 'vec2'
    }
});

export const RerenderStorm = () => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => { setTick(n => n + 1) }, 16);
        return () => { clearInterval(id) };
    }, []);

    const phase = tick * 0.05;
    const uniforms: Record<string, UniformParam> = {
        u_offset: { type: 'vec2', value: vec2([Math.sin(phase), Math.cos(phase)]) }
    };

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <BaseShaderComponent
                programId='rerender-storm'
                shaderConfig={config}
                uniforms={uniforms}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};
