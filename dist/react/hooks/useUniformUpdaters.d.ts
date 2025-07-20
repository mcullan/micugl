import { UniformParam, UniformUpdaterDef } from '../../types';
export declare const useUniformUpdaters: (programId: string, uniforms: Record<string, UniformParam>, options?: {
    skipDefaultUniforms?: boolean;
}) => {
    [x: string]: UniformUpdaterDef<import('../../types').UniformType>[];
};
