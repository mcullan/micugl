import type { UniformType, UniformUpdaterDef, UniformValue } from '@/types';


export function createUniformUpdater<T extends UniformType>(
    name: string,
    type: T,
    value: UniformValue<T>
): UniformUpdaterDef<T> {
    return {
        name,
        type,
        updateFn: typeof value === 'function'
            ? (value)
            : (_time: number) => value
    };
}

export function createUniformUpdaters<T extends UniformType>(
    configs: {name: string; type: T; value: UniformValue<T>}[]
): UniformUpdaterDef<T>[] {
    return configs.map(({name, type, value}) => 
        createUniformUpdater(name, type, value)
    );
}

export function createCommonUpdaters(): UniformUpdaterDef<UniformType>[] {
    return [
        createUniformUpdater('u_time', 'float', (time: number) => time * 0.001),
        createUniformUpdater('u_resolution', 'vec2', 
            (_time: number, width = 0, height = 0) => new Float32Array([width, height])
        )
    ];
}
