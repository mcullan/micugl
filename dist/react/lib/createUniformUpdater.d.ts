import { UniformType, UniformUpdaterDef, UniformValue } from '../../types';
export declare function createUniformUpdater<T extends UniformType>(name: string, type: T, value: UniformValue<T>): UniformUpdaterDef<T>;
export declare function createUniformUpdaters<T extends UniformType>(configs: {
    name: string;
    type: T;
    value: UniformValue<T>;
}[]): UniformUpdaterDef<T>[];
export declare function createCommonUpdaters(): UniformUpdaterDef[];
