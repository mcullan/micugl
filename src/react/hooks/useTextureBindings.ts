import { useEffect, useRef } from 'react';

import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { augmentConfigWithSamplers, buildTextureBindings } from '@/react/lib/textureBindings';
import type { ShaderProgramConfig, TextureBindingSpec, TextureSource } from '@/types';

export interface TextureBindingsResult {
    bindings: TextureBindingSpec[] | undefined;
    invalidation: FrameInvalidation | null;
    config: ShaderProgramConfig;
}

export function useTextureBindings(
    textures: Record<string, TextureSource> | undefined,
    config: ShaderProgramConfig
): TextureBindingsResult {
    const fanInRef = useRef<FrameInvalidation | null>(null);
    const fanIn = (fanInRef.current ??= createFrameInvalidation());
    const relayedRef = useRef(new Map<FrameInvalidation, () => void>());

    const bindings = textures ? buildTextureBindings(textures) : undefined;

    useEffect(() => {
        const relayed = relayedRef.current;
        const sources = bindings ? bindings.map(binding => binding.source.invalidation) : [];

        for (const invalidation of sources) {
            if (!relayed.has(invalidation)) {
                relayed.set(invalidation, invalidation.connect(kind => { fanIn.request(kind) }));
            }
        }
        for (const [invalidation, dispose] of relayed) {
            if (!sources.includes(invalidation)) {
                dispose();
                relayed.delete(invalidation);
            }
        }
    });

    useEffect(() => {
        const relayed = relayedRef.current;
        return () => {
            relayed.forEach(dispose => { dispose() });
            relayed.clear();
        };
    }, []);

    return {
        bindings,
        invalidation: textures ? fanIn : null,
        config: bindings ? augmentConfigWithSamplers(config, bindings) : config
    };
}
