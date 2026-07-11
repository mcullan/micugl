import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec3 } from '../../src/core/lib/vectorUtils';
import { PingPongShaderEngine } from '../../src/react/components/engine/PingPongShaderEngine';
import { usePingPongPasses } from '../../src/react/hooks/usePingPongPasses';
import type { ShaderProgramConfig } from '../../src/types';
import { getIntQuery } from './query';
import { PINGPONG_RENDER, PINGPONG_SIMULATION, PINGPONG_VERTEX } from './shaders';

const simulationConfig = createShaderConfig({
    vertexShader: PINGPONG_VERTEX,
    fragmentShader: PINGPONG_SIMULATION,
    uniformNames: {
        u_texture0: 'sampler2D'
    }
});

const renderConfig = createShaderConfig({
    vertexShader: PINGPONG_VERTEX,
    fragmentShader: PINGPONG_RENDER,
    uniformNames: {
        u_texture0: 'sampler2D',
        u_color1: 'vec3',
        u_color2: 'vec3'
    }
});

const programConfigs: Record<string, ShaderProgramConfig> = {
    'pingpong-sim': simulationConfig,
    'pingpong-render': renderConfig
};

export const PingPongSim = () => {
    const iterations = getIntQuery('iterations', 4);

    const { passes, framebuffers } = usePingPongPasses({
        programId: 'pingpong-sim',
        secondaryProgramId: 'pingpong-render',
        iterations,
        uniforms: {},
        secondaryUniforms: {
            u_color1: { type: 'vec3', value: vec3([0.1, 0.2, 0.4]) },
            u_color2: { type: 'vec3', value: vec3([0.4, 0.2, 0.3]) }
        },
        framebufferOptions: {
            width: 0,
            height: 0,
            textureCount: 2,
            textureOptions: {
                minFilter: WebGLRenderingContext.LINEAR,
                magFilter: WebGLRenderingContext.LINEAR
            }
        }
    });

    return (
        <PingPongShaderEngine
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            style={{ width: '100vw', height: '100vh', display: 'block' }}
        />
    );
};
