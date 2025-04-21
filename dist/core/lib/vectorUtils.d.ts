import { Float32Array2, Float32Array3, Float32Array4, Float32Array9, Float32Array16, Mat2, Mat3, Mat4, TypedFloat32Array, Vec2, Vec3, Vec4 } from '../../types';
export declare function createTypedFloat32Array<N extends number>(length: N): TypedFloat32Array<N>;
export declare function vec2(values?: Vec2): Float32Array2;
export declare function vec3(values?: Vec3): Float32Array3;
export declare function vec4(values?: Vec4): Float32Array4;
export declare function mat2(values?: Mat2): Float32Array4;
export declare function mat3(values?: Mat3): Float32Array9;
export declare function mat4(values?: Mat4): Float32Array16;
