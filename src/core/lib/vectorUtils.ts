import type { 
    Float32Array2, 
    Float32Array3,
    Float32Array4,
    Float32Array9,
    Float32Array16,
    Mat2,
    Mat3, 
    Mat4,
    TypedFloat32Array, 
    Vec2, 
    Vec3, 
    Vec4 
} from '@/types';

export function createTypedFloat32Array<N extends number>(length: N): TypedFloat32Array<N> {
    return new Float32Array(length) as TypedFloat32Array<N>;
}

export function vec2(values?: Vec2): Float32Array2 {
    const arr = new Float32Array(2) as Float32Array2;
    if (values) {
        arr.set(values);
    }
    return arr;
}

export function vec3(values?: Vec3): Float32Array3 {
    const arr = new Float32Array(3) as Float32Array3;
    if (values) {
        arr.set(values);
    }
    return arr;
}

export function vec4(values?: Vec4): Float32Array4 {
    const arr = new Float32Array(4) as Float32Array4;
    if (values) {
        arr.set(values);
    }
    return arr;
}

export function mat2(values?: Mat2): Float32Array4 {
    const arr = new Float32Array(4) as Float32Array4;
    if (values) {
        arr.set(values);
    }
    return arr;
}

export function mat3(values?: Mat3): Float32Array9 {
    const arr = new Float32Array(9) as Float32Array9;
    if (values) {
        arr.set(values);
    }
    return arr;
}

export function mat4(values?: Mat4): Float32Array16 {
    const arr = new Float32Array(16) as Float32Array16;
    if (values) {
        arr.set(values);
    }
    return arr;
}
