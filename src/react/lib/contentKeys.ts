import type {
    FramebufferOptions,
    InstancingConfig,
    ShaderProgramConfig,
    TextureBindingSpec,
    TextureSource
} from '@/types';

export const FIELD_SEPARATOR = '\u0000';
export const ENTRY_SEPARATOR = '\u0001';

export function singleProgramEntry(
    programConfigs: Record<string, ShaderProgramConfig>
): [string, ShaderProgramConfig] {
    const entries = Object.entries(programConfigs);
    if (entries.length !== 1) {
        throw new Error(
            `micugl requires exactly one entry in programConfigs, received ${entries.length}`
        );
    }
    return entries[0];
}

export function programConfigContentKey(programId: string, config: ShaderProgramConfig): string {
    return [
        programId,
        config.vertexShader,
        config.fragmentShader,
        JSON.stringify(config.uniforms),
        JSON.stringify(config.attributes ?? [])
    ].join(FIELD_SEPARATOR);
}

export function programConfigsContentKey(programConfigs: Record<string, ShaderProgramConfig>): string {
    return Object.entries(programConfigs)
        .map(([programId, config]) => programConfigContentKey(programId, config))
        .join(ENTRY_SEPARATOR);
}

export function framebuffersContentKey(framebuffers: Record<string, FramebufferOptions> | undefined): string {
    if (!framebuffers) {
        return '';
    }
    return Object.entries(framebuffers)
        .map(([id, options]) => [
            id,
            String(options.width),
            String(options.height),
            String(options.textureCount ?? 2),
            JSON.stringify(options.textureOptions ?? {})
        ].join(FIELD_SEPARATOR))
        .join(ENTRY_SEPARATOR);
}

export function texturesContentKey(bindings: TextureBindingSpec[] | undefined): string {
    if (!bindings || bindings.length === 0) {
        return '';
    }
    return bindings
        .map(binding => [
            binding.samplerName,
            String(binding.unit),
            binding.source.id,
            JSON.stringify(binding.source.options)
        ].join(FIELD_SEPARATOR))
        .join(ENTRY_SEPARATOR);
}

export function instancingContentKey(instancing: InstancingConfig | undefined): string {
    if (!instancing) {
        return '';
    }
    return Object.keys(instancing.attributes)
        .sort()
        .map(name => {
            const attribute = instancing.attributes[name];
            return [
                name,
                String(attribute.size),
                attribute.usage ?? 'static',
                String(attribute.normalized ?? false),
                String(attribute.capacity ?? '')
            ].join(FIELD_SEPARATOR);
        })
        .join(ENTRY_SEPARATOR);
}

export function textureSourcesContentKey(sources: TextureSource[] | undefined): string {
    if (!sources || sources.length === 0) {
        return '';
    }
    return sources
        .map(source => [source.id, JSON.stringify(source.options)].join(FIELD_SEPARATOR))
        .join(ENTRY_SEPARATOR);
}
