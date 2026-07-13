import { describe, expect, it } from 'vitest';

import { UNIFORM_COMPONENTS } from '@/core/lib/uniformComponents';
import {
    activeUniformTypes,
    GL_UNIFORM_TYPES,
    uploadCallFor,
    uploadReaches
} from '@/core/lib/uniformReflection';
import type { ActiveUniform, UniformType } from '@/types';

const ALL_TYPES = Object.keys(UNIFORM_COMPONENTS) as UniformType[];

const GL_BOOL = 0x8b56;
const GL_BOOL_VEC2 = 0x8b57;
const GL_INT_VEC2 = 0x8b53;
const GL_SAMPLER_CUBE = 0x8b60;

function reflect(name: string, glType: number): ActiveUniform {
    const active = activeUniformTypes([{ name, type: glType, size: 1 }])[name];
    if (!active) {
        throw new Error(`activeUniformTypes dropped ${name}`);
    }
    return active;
}

function accepts(glType: number, type: UniformType): boolean {
    return uploadReaches(reflect('u_x', glType), type);
}

describe('the GL enum table', () => {
    it('agrees with the reflection table for every UniformType micugl can upload', () => {
        for (const type of ALL_TYPES) {
            expect(accepts(GL_UNIFORM_TYPES[type], type)).toBe(true);
        }
    });

    it('accepts an int upload for a sampler2D and a sampler2D upload for an int, because both are uniform1i', () => {
        expect(uploadCallFor('int')).toBe('uniform1i');
        expect(uploadCallFor('sampler2D')).toBe('uniform1i');
        expect(accepts(GL_UNIFORM_TYPES.sampler2D, 'int')).toBe(true);
        expect(accepts(GL_UNIFORM_TYPES.int, 'sampler2D')).toBe(true);
    });

    it('rejects every upload whose GL call differs from the one the GLSL type requires', () => {
        expect(accepts(GL_UNIFORM_TYPES.vec3, 'vec4')).toBe(false);
        expect(accepts(GL_UNIFORM_TYPES.float, 'int')).toBe(false);
        expect(accepts(GL_UNIFORM_TYPES.float, 'vec2')).toBe(false);
        expect(accepts(GL_UNIFORM_TYPES.mat3, 'mat4')).toBe(false);
        expect(accepts(GL_UNIFORM_TYPES.sampler2D, 'float')).toBe(false);
    });
});

describe('a GLSL type micugl has no UniformType for', () => {
    it('accepts the int upload a bool and a samplerCube take, because WebGL sets both with uniform1i', () => {
        expect(reflect('u_dark', GL_BOOL).glslType).toBe('bool');
        expect(accepts(GL_BOOL, 'int')).toBe(true);
        expect(accepts(GL_SAMPLER_CUBE, 'sampler2D')).toBe(true);
    });

    it('rejects a float upload to a bool, which WebGL would reject with INVALID_OPERATION', () => {
        expect(accepts(GL_BOOL, 'float')).toBe(false);
    });

    it('rejects every upload to an ivec or a bvec, which micugl cannot set at all', () => {
        expect(reflect('u_size', GL_INT_VEC2).glslType).toBe('ivec2');
        expect(reflect('u_flags', GL_BOOL_VEC2).glslType).toBe('bvec2');

        for (const type of ALL_TYPES) {
            expect(accepts(GL_INT_VEC2, type)).toBe(false);
            expect(accepts(GL_BOOL_VEC2, type)).toBe(false);
        }
    });
});

describe('activeUniformTypes', () => {
    it('reads the real GLSL type of each active uniform', () => {
        const types = activeUniformTypes([
            { name: 'u_time', type: GL_UNIFORM_TYPES.float, size: 1 },
            { name: 'u_resolution', type: GL_UNIFORM_TYPES.vec2, size: 1 },
            { name: 'u_texture0', type: GL_UNIFORM_TYPES.sampler2D, size: 1 }
        ]);

        expect(Object.keys(types)).toEqual(['u_time', 'u_resolution', 'u_texture0']);
        expect(types.u_time?.glslType).toBe('float');
        expect(types.u_resolution?.glslType).toBe('vec2');
        expect(types.u_texture0?.glslType).toBe('sampler2D');
    });

    it('omits an array uniform, which WebGL reports as "u_x[0]" and micugl cannot upload', () => {
        const types = activeUniformTypes([
            { name: 'u_weights[0]', type: GL_UNIFORM_TYPES.float, size: 8 },
            { name: 'u_gain', type: GL_UNIFORM_TYPES.float, size: 1 }
        ]);

        expect(Object.keys(types)).toEqual(['u_gain']);
    });

    it('throws for a GL type that is not a WebGL 1 uniform type at all, instead of skipping it', () => {
        expect(() => activeUniformTypes([{ name: 'u_x', type: 0x1234, size: 1 }]))
            .toThrow(/u_x.*0x1234.*not a WebGL 1 uniform type/);
    });

    it('reads back nothing for a uniform named after an Object.prototype member', () => {
        const types = activeUniformTypes([{ name: 'u_gain', type: GL_UNIFORM_TYPES.float, size: 1 }]);
        expect(Object.getPrototypeOf(types)).toBe(null);
        expect('toString' in types).toBe(false);
        expect('constructor' in types).toBe(false);
    });
});
