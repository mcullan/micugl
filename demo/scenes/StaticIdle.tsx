import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec2 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import { GRADIENT_FRAGMENT, QUAD_VERTEX } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: GRADIENT_FRAGMENT,
    uniformNames: {
        u_resolution: 'vec2'
    }
});

const uniforms: Record<string, UniformParam> = {
    u_resolution: { type: 'vec2', value: vec2([512, 512]) }
};

export const StaticIdle = () => {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <BaseShaderComponent
                programId='static-idle'
                shaderConfig={config}
                uniforms={uniforms}
                skipDefaultUniforms
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};
