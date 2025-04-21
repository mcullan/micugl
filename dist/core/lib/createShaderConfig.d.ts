import { ShaderProgramConfig, UniformType } from '..';
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
export declare const createShaderConfig: (options: ShaderConfigOptions) => ShaderProgramConfig;
