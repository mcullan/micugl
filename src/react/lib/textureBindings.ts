import { normalizeUniformName } from '@/react/lib/liveUniformUpdaters';
import type { ShaderProgramConfig, TextureBindingSpec, TextureSource, UniformConfig } from '@/types';

export function buildTextureBindings(textures: Record<string, TextureSource>): TextureBindingSpec[] {
    return Object.entries(textures).map(([name, source], index) => ({
        unit: index,
        samplerName: normalizeUniformName(name),
        source
    }));
}

export function augmentConfigWithSamplers(
    config: ShaderProgramConfig,
    bindings: TextureBindingSpec[]
): ShaderProgramConfig {
    const declared = new Set(config.uniforms.map(uniform => uniform.name));
    const additions: UniformConfig[] = [];

    for (const binding of bindings) {
        if (declared.has(binding.samplerName)) {
            continue;
        }
        declared.add(binding.samplerName);
        additions.push({ name: binding.samplerName, type: 'sampler2D' });
    }

    if (additions.length === 0) {
        return config;
    }

    return { ...config, uniforms: [...config.uniforms, ...additions] };
}
