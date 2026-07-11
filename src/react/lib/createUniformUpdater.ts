import { vec2 } from '@/core/lib/vectorUtils';
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
            ? value
            : ((_time?: number) => value)
    };
}

export function createUniformUpdaters<T extends UniformType>(
    configs: {name: string; type: T; value: UniformValue<T>}[]
): UniformUpdaterDef<T>[] {
    return configs.map(({name, type, value}) => 
        createUniformUpdater(name, type, value)
    );
}

export function createCommonUpdaters(): UniformUpdaterDef[] {
    const resolution = vec2();
    return [
        createUniformUpdater('u_time', 'float', (time?: number) => (time ?? 0) * 0.001),
        createUniformUpdater('u_resolution', 'vec2',
            (_time?: number, width?: number, height?: number) => {
                resolution[0] = width ?? 0;
                resolution[1] = height ?? 0;
                return resolution;
            }
        )
    ];
}
