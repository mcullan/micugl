import { GL_FLOAT } from '@/core/lib/glConstants';
import type { ActiveUniform, ActiveUniformTypes, UniformType, UniformUploadCall } from '@/types';

export const GL_UNIFORM_TYPES = {
    float: GL_FLOAT,
    int: 0x1404,
    sampler2D: 0x8b5e,
    vec2: 0x8b50,
    vec3: 0x8b51,
    vec4: 0x8b52,
    mat2: 0x8b5a,
    mat3: 0x8b5b,
    mat4: 0x8b5c
} as const satisfies Record<UniformType, number>;

const UPLOAD_CALL_BY_UNIFORM_TYPE = {
    float: 'uniform1f',
    int: 'uniform1i',
    sampler2D: 'uniform1i',
    vec2: 'uniform2fv',
    vec3: 'uniform3fv',
    vec4: 'uniform4fv',
    mat2: 'uniformMatrix2fv',
    mat3: 'uniformMatrix3fv',
    mat4: 'uniformMatrix4fv'
} as const satisfies Record<UniformType, UniformUploadCall>;

const ACTIVE_UNIFORM_BY_GL_TYPE = new Map<number, ActiveUniform>([
    [GL_FLOAT, { glslType: 'float', uploadCall: 'uniform1f' }],
    [0x8b50, { glslType: 'vec2', uploadCall: 'uniform2fv' }],
    [0x8b51, { glslType: 'vec3', uploadCall: 'uniform3fv' }],
    [0x8b52, { glslType: 'vec4', uploadCall: 'uniform4fv' }],
    [0x1404, { glslType: 'int', uploadCall: 'uniform1i' }],
    [0x8b53, { glslType: 'ivec2', uploadCall: 'uniform2iv' }],
    [0x8b54, { glslType: 'ivec3', uploadCall: 'uniform3iv' }],
    [0x8b55, { glslType: 'ivec4', uploadCall: 'uniform4iv' }],
    [0x8b56, { glslType: 'bool', uploadCall: 'uniform1i' }],
    [0x8b57, { glslType: 'bvec2', uploadCall: 'uniform2iv' }],
    [0x8b58, { glslType: 'bvec3', uploadCall: 'uniform3iv' }],
    [0x8b59, { glslType: 'bvec4', uploadCall: 'uniform4iv' }],
    [0x8b5a, { glslType: 'mat2', uploadCall: 'uniformMatrix2fv' }],
    [0x8b5b, { glslType: 'mat3', uploadCall: 'uniformMatrix3fv' }],
    [0x8b5c, { glslType: 'mat4', uploadCall: 'uniformMatrix4fv' }],
    [0x8b5e, { glslType: 'sampler2D', uploadCall: 'uniform1i' }],
    [0x8b60, { glslType: 'samplerCube', uploadCall: 'uniform1i' }]
]);

export interface ActiveUniformInfo {
    name: string;
    type: number;
    size: number;
}

export function uploadCallFor(type: UniformType): UniformUploadCall {
    return UPLOAD_CALL_BY_UNIFORM_TYPE[type];
}

export function uploadReaches(active: ActiveUniform, type: UniformType): boolean {
    return active.uploadCall === uploadCallFor(type);
}

function isArrayUniformName(name: string): boolean {
    return name.endsWith(']');
}

export function activeUniformTypes(infos: ActiveUniformInfo[]): ActiveUniformTypes {
    const types = Object.create(null) as ActiveUniformTypes;

    for (const info of infos) {
        if (isArrayUniformName(info.name) || info.size > 1) {
            continue;
        }

        const active = ACTIVE_UNIFORM_BY_GL_TYPE.get(info.type);
        if (!active) {
            throw new Error(
                `Uniform "${info.name}" has GL type 0x${info.type.toString(16)}, which is not a WebGL 1 uniform type`
            );
        }

        types[info.name] = active;
    }

    return types;
}
