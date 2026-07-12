import { describe, expect, it } from 'vitest';

import { vec2, vec3 } from '@/core/lib/vectorUtils';
import {
    buildLiveUpdaters,
    collectLiveValues,
    combineUniformDebugPorts,
    createUniformDebugPort,
    type LiveValues,
    mergeOverrides,
    normalizeUniformName,
    parseUniformStructureKey,
    type UniformDebugPortRefs,
    type UniformDescriptor,
    uniformDescriptors,
    uniformStructureKey,
    validateOverrideValue
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

describe('mergeOverrides', () => {
    it('returns the base object by identity when overrides is empty', () => {
        const base: LiveValues = { u_a: 1 };
        expect(mergeOverrides(base, {})).toBe(base);
    });

    it('override wins over base for a shared key', () => {
        const merged = mergeOverrides({ u_a: 1, u_b: 2 }, { u_a: 99 });
        expect(merged).toEqual({ u_a: 99, u_b: 2 });
    });

    it('clearing overrides (empty object) restores base identity again', () => {
        const base: LiveValues = { u_a: 1 };
        const withOverride = mergeOverrides(base, { u_a: 2 });
        expect(withOverride).not.toBe(base);

        const restored = mergeOverrides(base, {});
        expect(restored).toBe(base);
    });
});

describe('validateOverrideValue', () => {
    it('coerces a valid float value', () => {
        expect(validateOverrideValue('float', '1.5')).toBe(1.5);
    });

    it('rejects NaN for float', () => {
        expect(() => validateOverrideValue('float', 'not-a-number')).toThrow(/finite number/);
    });

    it('rejects Infinity for float', () => {
        expect(() => validateOverrideValue('float', Infinity)).toThrow(/finite number/);
    });

    it('truncates int values', () => {
        expect(validateOverrideValue('int', 3.9)).toBe(3);
    });

    it('truncates sampler2D values', () => {
        expect(validateOverrideValue('sampler2D', 2.7)).toBe(2);
    });

    it('accepts a vec3 of the right length', () => {
        const result = validateOverrideValue('vec3', [1, 2, 3]) as Float32Array;
        expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('rejects a vec3 of the wrong length', () => {
        expect(() => validateOverrideValue('vec3', [1, 2])).toThrow(/expects 3 components/);
    });

    it('rejects a non-array-like value for a vector type', () => {
        expect(() => validateOverrideValue('vec2', 5)).toThrow(/expects 2 components/);
    });

    it('rejects a vector containing a non-finite component', () => {
        expect(() => validateOverrideValue('vec2', [1, NaN])).toThrow(/finite number/);
    });

    it('accepts a mat4 of the right length', () => {
        const result = validateOverrideValue('mat4', new Array(16).fill(0)) as Float32Array;
        expect(result.length).toBe(16);
    });
});

function createPortRefs(descriptors: UniformDescriptor[], base: LiveValues): UniformDebugPortRefs {
    const baseValuesRef = { current: base };
    const overridesRef: { current: LiveValues } = { current: {} };
    const valuesRef: { current: LiveValues } = { current: { ...base } };
    const descriptorsRef = { current: descriptors };
    return { descriptorsRef, baseValuesRef, overridesRef, valuesRef };
}

describe('createUniformDebugPort', () => {
    it('lists uniforms with current value and overridden flag', () => {
        const refs = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const port = createUniformDebugPort(refs);

        expect(port.list()).toEqual([{ name: 'u_a', type: 'float', value: 1, overridden: false }]);
    });

    it('setOverride writes both overridesRef and valuesRef immediately', () => {
        const refs = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const port = createUniformDebugPort(refs);

        port.setOverride('u_a', 5);

        expect(refs.overridesRef.current.u_a).toBe(5);
        expect(refs.valuesRef.current.u_a).toBe(5);
        expect(port.list()[0]).toEqual({ name: 'u_a', type: 'float', value: 5, overridden: true });
    });

    it('clearOverride restores the base value and removes the override', () => {
        const refs = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const port = createUniformDebugPort(refs);

        port.setOverride('u_a', 5);
        port.clearOverride('u_a');

        expect(refs.overridesRef.current.u_a).toBeUndefined();
        expect(refs.valuesRef.current.u_a).toBe(1);
        expect(port.list()[0].overridden).toBe(false);
    });

    it('clearOverride restores the base value when valuesRef aliases baseValuesRef (fast path)', () => {
        const base: LiveValues = { u_a: 1 };
        const baseValuesRef = { current: base };
        const overridesRef: { current: LiveValues } = { current: {} };
        const valuesRef = { current: mergeOverrides(base, {}) };
        const descriptorsRef = { current: [{ name: 'u_a', type: 'float' } as UniformDescriptor] };
        const port = createUniformDebugPort({ descriptorsRef, baseValuesRef, overridesRef, valuesRef });

        expect(valuesRef.current).toBe(baseValuesRef.current);

        port.setOverride('u_a', 5);
        expect(baseValuesRef.current.u_a).toBe(1);

        port.clearOverride('u_a');
        expect(valuesRef.current.u_a).toBe(1);
        expect(port.list()[0].overridden).toBe(false);
    });

    it('setOverride throws a descriptive error for an unknown uniform', () => {
        const refs = createPortRefs([], {});
        const port = createUniformDebugPort(refs);

        expect(() => { port.setOverride('u_missing', 1) }).toThrow(/unknown uniform/);
    });

    it('setOverride throws and leaves state untouched when validation fails', () => {
        const refs = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const port = createUniformDebugPort(refs);

        expect(() => { port.setOverride('u_a', NaN) }).toThrow(/finite number/);
        expect(refs.overridesRef.current.u_a).toBeUndefined();
        expect(refs.valuesRef.current.u_a).toBe(1);
    });

    it('int type override is truncated through the port', () => {
        const refs = createPortRefs([{ name: 'u_i', type: 'int' }], { u_i: 0 });
        const port = createUniformDebugPort(refs);

        port.setOverride('u_i', 4.8);

        expect(refs.valuesRef.current.u_i).toBe(4);
    });
});

describe('combineUniformDebugPorts', () => {
    it('list concatenates entries from every port', () => {
        const refsA = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const refsB = createPortRefs([{ name: 'u_b', type: 'float' }], { u_b: 2 });
        const combined = combineUniformDebugPorts([
            createUniformDebugPort(refsA),
            createUniformDebugPort(refsB)
        ]);

        expect(combined.list().map(entry => entry.name)).toEqual(['u_a', 'u_b']);
    });

    it('setOverride routes to the port that owns the uniform', () => {
        const refsA = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const refsB = createPortRefs([{ name: 'u_b', type: 'float' }], { u_b: 2 });
        const combined = combineUniformDebugPorts([
            createUniformDebugPort(refsA),
            createUniformDebugPort(refsB)
        ]);

        combined.setOverride('u_b', 9);

        expect(refsB.valuesRef.current.u_b).toBe(9);
        expect(refsA.valuesRef.current.u_a).toBe(1);
    });

    it('setOverride applies to every port sharing a uniform name', () => {
        const refsA = createPortRefs([{ name: 'u_time', type: 'float' }], { u_time: 1 });
        const refsB = createPortRefs([{ name: 'u_time', type: 'float' }], { u_time: 1 });
        const combined = combineUniformDebugPorts([
            createUniformDebugPort(refsA),
            createUniformDebugPort(refsB)
        ]);

        combined.setOverride('u_time', 7);

        expect(refsA.valuesRef.current.u_time).toBe(7);
        expect(refsB.valuesRef.current.u_time).toBe(7);
    });

    it('throws for a uniform unknown to every port', () => {
        const refsA = createPortRefs([{ name: 'u_a', type: 'float' }], { u_a: 1 });
        const combined = combineUniformDebugPorts([createUniformDebugPort(refsA)]);

        expect(() => { combined.setOverride('u_missing', 1) }).toThrow(/unknown uniform/);
        expect(() => { combined.clearOverride('u_missing') }).toThrow(/unknown uniform/);
    });
});
