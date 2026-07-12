import { describe, expect, it } from 'vitest';

import { resolveAttributeData, resolveInstanceCount } from '@/core/lib/instanceBuffers';
import { createDelegatingInstancingConfig } from '@/react/lib/instancingConfig';
import type { InstancingConfig } from '@/types';

describe('createDelegatingInstancingConfig', () => {
    it('reads instanceCount from the latest config, not the initial one', () => {
        const initial: InstancingConfig = {
            instanceCount: 3,
            attributes: { offset: { data: new Float32Array([0, 0]), size: 2 } }
        };
        let latest = initial;
        const delegating = createDelegatingInstancingConfig(initial, () => latest);

        expect(resolveInstanceCount(delegating.instanceCount)).toBe(3);

        latest = { ...initial, instanceCount: 7 };
        expect(resolveInstanceCount(delegating.instanceCount)).toBe(7);
    });

    it('reads attribute data from the latest config by name', () => {
        const firstData = new Float32Array([1, 1]);
        const secondData = new Float32Array([2, 2]);
        const initial: InstancingConfig = {
            instanceCount: 1,
            attributes: { offset: { data: firstData, size: 2 } }
        };
        let latest = initial;
        const delegating = createDelegatingInstancingConfig(initial, () => latest);

        expect(resolveAttributeData(delegating.attributes.offset.data)).toBe(firstData);

        latest = { instanceCount: 1, attributes: { offset: { data: secondData, size: 2 } } };
        expect(resolveAttributeData(delegating.attributes.offset.data)).toBe(secondData);
    });

    it('preserves structural fields (size/usage/normalized/capacity) from the initial attribute', () => {
        const initial: InstancingConfig = {
            instanceCount: 1,
            attributes: {
                offset: {
                    data: new Float32Array([0, 0]),
                    size: 2,
                    usage: 'dynamic',
                    normalized: true,
                    capacity: 100
                }
            }
        };
        const delegating = createDelegatingInstancingConfig(initial, () => initial);

        expect(delegating.attributes.offset.size).toBe(2);
        expect(delegating.attributes.offset.usage).toBe('dynamic');
        expect(delegating.attributes.offset.normalized).toBe(true);
        expect(delegating.attributes.offset.capacity).toBe(100);
    });

    it('throws naming the attribute when it is missing from the latest config', () => {
        const initial: InstancingConfig = {
            instanceCount: 1,
            attributes: { offset: { data: new Float32Array([0, 0]), size: 2 } }
        };
        const latest: InstancingConfig = { instanceCount: 1, attributes: {} };
        const delegating = createDelegatingInstancingConfig(initial, () => latest);

        expect(() => resolveAttributeData(delegating.attributes.offset.data)).toThrow(/offset/);
    });

    it('resolves a function-valued data getter from the latest config', () => {
        const initial: InstancingConfig = {
            instanceCount: 1,
            attributes: { offset: { data: new Float32Array([0, 0]), size: 2 } }
        };
        const dynamicData = new Float32Array([5, 5]);
        const latest: InstancingConfig = {
            instanceCount: 1,
            attributes: { offset: { data: () => dynamicData, size: 2 } }
        };
        const delegating = createDelegatingInstancingConfig(initial, () => latest);

        expect(resolveAttributeData(delegating.attributes.offset.data)).toBe(dynamicData);
    });
});
