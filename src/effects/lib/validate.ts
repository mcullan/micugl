import type { Vec3 } from '@/types';

export const assertFinite = (name: string, value: number): number => {
    if (!Number.isFinite(value)) {
        throw new Error(
            `micugl effects: "${name}" must be a finite number, received ${String(value)}.`
        );
    }
    return value;
};

export const assertVec3 = (name: string, value: readonly number[]): Vec3 => {
    if (value.length !== 3) {
        throw new Error(
            `micugl effects: "${name}" must be a 3-number tuple [r, g, b], received length ${String(value.length)}.`
        );
    }
    return [
        assertFinite(`${name}[0]`, value[0]),
        assertFinite(`${name}[1]`, value[1]),
        assertFinite(`${name}[2]`, value[2])
    ];
};

export const assertColors = (name: string, colors: readonly (readonly number[])[]): Vec3[] => {
    if (colors.length < 2 || colors.length > 4) {
        throw new Error(
            `micugl effects: "${name}" must hold between 2 and 4 colors, received ${String(colors.length)}.`
        );
    }
    return colors.map((color, index) => assertVec3(`${name}[${index}]`, color));
};
