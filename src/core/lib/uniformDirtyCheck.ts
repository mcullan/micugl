import type { UniformType, UniformTypeMap, UniformUpdateFn } from '@/types';

type Evaluate = (time?: number, width?: number, height?: number) => unknown;

export function writeFloatBuffer(buffer: Float32Array, value: ArrayLike<number>): boolean {
    let changed = false;
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== value[i]) {
            buffer[i] = value[i];
            changed = true;
        }
    }
    return changed;
}

export function createScalarUpdater(
    evaluate: Evaluate,
    upload: (value: number) => void
): UniformUpdateFn<UniformType> {
    let last: number | undefined;
    return (time, width, height) => {
        const value = evaluate(time, width, height) as number;
        if (value !== last) {
            last = value;
            upload(value);
        }
        return value as UniformTypeMap[UniformType];
    };
}

export function createVectorUpdater(
    size: number,
    evaluate: Evaluate,
    upload: (buffer: Float32Array) => void
): UniformUpdateFn<UniformType> {
    const buffer = new Float32Array(size);
    let uploaded = false;
    return (time, width, height) => {
        const value = evaluate(time, width, height) as ArrayLike<number>;
        const changed = writeFloatBuffer(buffer, value);
        if (changed || !uploaded) {
            uploaded = true;
            upload(buffer);
        }
        return buffer as UniformTypeMap[UniformType];
    };
}
