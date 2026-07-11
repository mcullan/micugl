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

const uniforms: Record<string, UniformParam> = {
    u_offset: { type: 'vec2', value: vec2([0, 0]) }
};

export const DevtoolsDebug = () => {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <BaseShaderComponent
                programId='devtools-debug'
                shaderConfig={config}
                uniforms={uniforms}
                debug
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};
