import { describe, expect, it } from 'vitest';

import type { RipplePointer } from '@/effects/Ripple/rippleUniforms';
import { rippleRenderUniforms, rippleSimUniforms } from '@/effects/Ripple/rippleUniforms';
import type { AudioUniformsResult } from '@/react';
import type { UniformParam } from '@/types';

const POINTER: RipplePointer = {
    position: () => [0.25, 0.75],
    force: () => 0
};

function fakeAudio(level: UniformParam): AudioUniformsResult {
    return {
        uniforms: { u_audioLevel: level },
        start: () => Promise.resolve(),
        stop: () => undefined,
        status: 'running',
        error: null
    };
}

describe('rippleSimUniforms validation (T9)', () => {
    it('builds the sim uniforms with defaults', () => {
        const uniforms = rippleSimUniforms({}, POINTER);
        expect(uniforms.u_damping).toEqual({ type: 'float', value: 0.99 });
        expect(uniforms.u_autoDrip).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_audioLevel).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_audioStrength).toEqual({ type: 'float', value: 0 });
        expect(uniforms.u_mouse.type).toBe('vec2');
        expect(uniforms.u_mouseForce.type).toBe('float');
    });

    it('sets u_autoDrip to 1 when autoDrip is on', () => {
        expect(rippleSimUniforms({ autoDrip: true }, POINTER).u_autoDrip).toEqual({ type: 'float', value: 1 });
    });

    it('throws when damping is 0 (a never-decaying, permanently hot field)', () => {
        expect(() => rippleSimUniforms({ damping: 0 }, POINTER)).toThrow(/damping/);
    });

    it('throws when damping is 1 (a never-settling field)', () => {
        expect(() => rippleSimUniforms({ damping: 1 }, POINTER)).toThrow(/damping/);
    });

    it('throws when damping is negative', () => {
        expect(() => rippleSimUniforms({ damping: -0.5 }, POINTER)).toThrow(/damping/);
    });

    it('throws when damping is non-finite', () => {
        expect(() => rippleSimUniforms({ damping: Number.NaN }, POINTER)).toThrow(/finite/);
    });

    it('throws when mouseForce is non-finite', () => {
        expect(() => rippleSimUniforms({ mouseForce: Number.POSITIVE_INFINITY }, POINTER)).toThrow(/mouseForce/);
    });

    it('throws when audioStrength is non-finite', () => {
        expect(() => rippleSimUniforms({ audioStrength: Number.NaN }, POINTER)).toThrow(/audioStrength/);
    });

    it('forwards the audio level uniform by reference so its liveness rides through', () => {
        const level: UniformParam = { type: 'float', value: 0.3 };
        const uniforms = rippleSimUniforms({ audio: fakeAudio(level) }, POINTER);
        expect(uniforms.u_audioLevel).toBe(level);
    });
});

describe('rippleRenderUniforms validation (T9)', () => {
    it('builds color uniforms from defaults', () => {
        const uniforms = rippleRenderUniforms();
        expect(Array.from(uniforms.u_color1.value as Float32Array)).toEqual([
            Math.fround(0.1), Math.fround(0.3), Math.fround(0.1)
        ]);
        expect(uniforms.u_color2.type).toBe('vec3');
    });

    it('throws on a malformed color tuple', () => {
        expect(() => rippleRenderUniforms({ color1: [0.1, 0.2] as unknown as [number, number, number] }))
            .toThrow(/color1/);
    });

    it('throws on a non-finite color channel', () => {
        expect(() => rippleRenderUniforms({ color2: [0.1, Number.NaN, 0.2] })).toThrow(/color2/);
    });
});
