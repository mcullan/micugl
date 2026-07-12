import { resolveAttributeData, resolveInstanceCount } from '@/core/lib/instanceBuffers';
import type { InstanceAttribute, InstancingConfig } from '@/types';

export function createDelegatingInstancingConfig(
    initial: InstancingConfig,
    getLatest: () => InstancingConfig
): InstancingConfig {
    const attributes: Record<string, InstanceAttribute> = {};

    for (const [name, attribute] of Object.entries(initial.attributes)) {
        attributes[name] = {
            ...attribute,
            data: () => {
                const latestAttribute = getLatest().attributes[name] as InstanceAttribute | undefined;
                if (!latestAttribute) {
                    throw new Error(
                        `ShaderEngine: instancing attribute "${name}" is missing from the latest instancing prop`
                    );
                }
                return resolveAttributeData(latestAttribute.data);
            }
        };
    }

    return {
        instanceCount: () => resolveInstanceCount(getLatest().instanceCount),
        attributes
    };
}
