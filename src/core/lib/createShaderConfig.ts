import type { ShaderProgramConfig, UniformType } from '@/core';

export interface ShaderConfigOptions {
  vertexShader: string;
  fragmentShader: string;
  uniformNames?: Record<string, UniformType>;
  attributeConfigs?: {
    name: string;
    size: number;
    type: 'FLOAT' | 'BYTE' | 'SHORT' | 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT';
    normalized?: boolean;
    stride?: number;
    offset?: number;
    instanced?: boolean;
  }[];
}

export const createShaderConfig = (options: ShaderConfigOptions): ShaderProgramConfig => {
    const { vertexShader, fragmentShader, uniformNames = {}, attributeConfigs = [] } = options;
  
    const defaultUniforms: Record<string, UniformType> = {
        'u_time': 'float',
        'u_resolution': 'vec2'
    };
  
    const allUniformNames = { ...defaultUniforms, ...uniformNames };
  
    const uniforms = Object.entries(allUniformNames).map(([name, type]) => ({
        name,
        type
    }));
  
    const attributes = attributeConfigs.map(config => ({
        name: config.name,
        size: config.size,
        type: config.type,
        normalized: config.normalized ?? false,
        stride: config.stride ?? 0,
        offset: config.offset ?? 0,
        instanced: config.instanced
    }));
  
    if (!attributes.some(attr => attr.name === 'a_position')) {
        attributes.push({
            name: 'a_position',
            size: 2,
            type: 'FLOAT',
            normalized: false,
            stride: 0,
            offset: 0,
            instanced: false
        });
    }
  
    return {
        vertexShader,
        fragmentShader,
        uniforms,
        attributes
    };
};
