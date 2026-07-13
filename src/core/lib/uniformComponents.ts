import type { UniformType } from '@/types';

export const UNIFORM_COMPONENTS = {
    float: 1,
    int: 1,
    sampler2D: 1,
    vec2: 2,
    vec3: 3,
    vec4: 4,
    mat2: 4,
    mat3: 9,
    mat4: 16
} as const satisfies Record<UniformType, number>;
