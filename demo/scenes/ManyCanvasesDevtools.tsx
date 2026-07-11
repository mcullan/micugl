import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { MicuglDevtools } from '../../src/react/devtools';
import type { UniformParam } from '../../src/types';
import { QUAD_VERTEX, WAVE_FRAGMENT } from './shaders';

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WAVE_FRAGMENT
});

const uniforms: Record<string, UniformParam> = {};

const cells = [0, 1, 2, 3, 4, 5, 6, 7];

export const ManyCanvasesDevtools = () => {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                padding: '8px',
                width: '100vw',
                height: '100vh'
            }}
        >
            {cells.map(index => (
                <div key={index} style={{ width: '100%', height: '100%', minHeight: '0' }}>
                    <BaseShaderComponent
                        programId={`many-${String(index)}`}
                        shaderConfig={config}
                        uniforms={uniforms}
                        width={160}
                        height={160}
                        pixelRatio={1}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                </div>
            ))}
            <MicuglDevtools defaultOpen={false} />
        </div>
    );
};
