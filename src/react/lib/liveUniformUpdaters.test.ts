import { describe, expect, it } from 'vitest';

import { vec2, vec3 } from '@/core/lib/vectorUtils';
import {
    buildLiveUpdaters,
    collectLiveValues,
    type LiveValues,
    normalizeUniformName,
    parseUniformStructureKey,
    type UniformDescriptor,
    uniformDescriptors,
    uniformStructureKey
} from '@/react/lib/liveUniformUpdaters';
import type { UniformParam } from '@/types';

describe('normalizeUniformName', () => {
    it('prefixes bare names with u_', () => {
        expect(normalizeUniformName('color')).toBe('u_color');
    });

    it('leaves already-prefixed names untouched', () => {
        expect(normalizeUniformName('u_color')).toBe('u_color');
    });
});

describe('uniformStructureKey', () => {
    const uniformsA: Record<string, UniformParam> = {
        u_color: { type: 'vec3', value: vec3([1, 2, 3]) },
        u_strength: { type: 'float', value: 0.5 }
    };

    it('is stable when only values change', () => {
        const uniformsB: Record<string, UniformParam> = {
            u_color: { type: 'vec3', value: vec3([9, 9, 9]) },
            u_strength: { type: 'float', value: 42 }
        };

        expect(uniformStructureKey(uniformDescriptors(uniformsA), false))
            .toBe(uniformStructureKey(uniformDescriptors(uniformsB), false));
    });

    it('changes when a uniform is added', () => {
        const withExtra: Record<string, UniformParam> = {
            ...uniformsA,
            u_extra: { type: 'float', value: 1 }
        };

        expect(uniformStructureKey(uniformDescriptors(uniformsA), false))
            .not.toBe(uniformStructureKey(uniformDescriptors(withExtra), false));
    });

    it('changes when a uniform is retyped', () => {
        const retyped: Record<string, UniformParam> = {
            ...uniformsA,
            u_strength: { type: 'int', value: 1 }
        };

        expect(uniformStructureKey(uniformDescriptors(uniformsA), false))
            .not.toBe(uniformStructureKey(uniformDescriptors(retyped), false));
    });

    it('changes when the skipDefaults flag differs', () => {
        expect(uniformStructureKey(uniformDescriptors(uniformsA), false))
            .not.toBe(uniformStructureKey(uniformDescriptors(uniformsA), true));
    });

    it('round-trips through parseUniformStructureKey', () => {
        const descriptors = uniformDescriptors(uniformsA);
        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));

        expect(parsed.skipDefaults).toBe(true);
        expect(parsed.descriptors).toEqual(descriptors);
    });

    it('round-trips an empty uniform set', () => {
        const parsed = parseUniformStructureKey(uniformStructureKey([], false));

        expect(parsed.skipDefaults).toBe(false);
        expect(parsed.descriptors).toEqual([]);
    });

    it('round-trips every uniform type without the head separator leaking into the body', () => {
        const descriptors: UniformDescriptor[] = [
            { name: 'u_i', type: 'int' },
            { name: 'u_tex', type: 'sampler2D' },
            { name: 'u_xform', type: 'mat4' },
            { name: 'u_color', type: 'vec3' }
        ];

        const parsed = parseUniformStructureKey(uniformStructureKey(descriptors, true));

        expect(parsed.skipDefaults).toBe(true);
        expect(parsed.descriptors).toEqual(descriptors);
    });
});

describe('buildLiveUpdaters', () => {
    it('reads the latest value from the ref every call', () => {
        const valuesRef: { current: LiveValues } = {
            current: { u_color: vec3([1, 2, 3]) }
        };
        const updaters = buildLiveUpdaters([{ name: 'u_color', type: 'vec3' }], true, valuesRef);
        const updater = updaters.find(u => u.name === 'u_color');

        expect(updater?.updateFn()).toEqual(vec3([1, 2, 3]));

        valuesRef.current = { u_color: vec3([4, 5, 6]) };
        expect(updater?.updateFn()).toEqual(vec3([4, 5, 6]));
    });

    it('evaluates function-valued sources against the live ref', () => {
        const valuesRef: { current: LiveValues } = {
            current: { u_wave: (time?: number) => vec2([time ?? 0, 0]) }
        };
        const updaters = buildLiveUpdaters([{ name: 'u_wave', type: 'vec2' }], true, valuesRef);
        const updater = updaters.find(u => u.name === 'u_wave');

        expect(updater?.updateFn(2)).toEqual(vec2([2, 0]));
        expect(updater?.updateFn(7)).toEqual(vec2([7, 0]));
    });

    it('injects u_time and u_resolution defaults unless skipped', () => {
        const valuesRef: { current: LiveValues } = { current: {} };
        const withDefaults = buildLiveUpdaters([], false, valuesRef);

        expect(withDefaults.map(u => u.name)).toEqual(['u_time', 'u_resolution']);

        const skipped = buildLiveUpdaters([], true, valuesRef);
        expect(skipped).toEqual([]);
    });

    it('does not inject a default that the caller already declares', () => {
        const valuesRef: { current: LiveValues } = { current: { u_time: 3 } };
        const updaters = buildLiveUpdaters([{ name: 'u_time', type: 'float' }], false, valuesRef);

        expect(updaters.map(u => u.name)).toEqual(['u_resolution', 'u_time']);
    });
});

describe('collectLiveValues', () => {
    it('keys values by the normalized uniform name', () => {
        const values = collectLiveValues({
            color: { type: 'vec3', value: vec3([1, 2, 3]) },
            u_strength: { type: 'float', value: 0.5 }
        });

        expect(values).toEqual({
            u_color: vec3([1, 2, 3]),
            u_strength: 0.5
        });
    });
});
