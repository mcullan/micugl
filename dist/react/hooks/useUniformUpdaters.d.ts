import { UniformParam, UniformUpdaterDef } from '../../types';
export declare const useUniformUpdaters: (programId: string, uniforms: Record<string, UniformParam>) => {
    [x: string]: UniformUpdaterDef<import('../../types').UniformType>[];
};
