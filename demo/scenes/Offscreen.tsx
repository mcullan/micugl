import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import { QUAD_VERTEX, WAVE_FRAGMENT } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WAVE_FRAGMENT
});

const uniforms: Record<string, UniformParam> = {};

export const Offscreen = () => {
    return (
        <div style={{ position: 'relative', width: '100%', height: '300vh' }}>
            <div style={{ position: 'absolute', top: '0', left: '0', width: '100%', padding: '24px' }}>
                Scroll target is far below the fold. The shader canvas stays mounted and offscreen.
            </div>
            <div style={{ position: 'absolute', top: '250vh', left: '0', width: '100vw', height: '50vh' }}>
                <BaseShaderComponent
                    programId='offscreen'
                    shaderConfig={config}
                    uniforms={uniforms}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                />
            </div>
        </div>
    );
};
