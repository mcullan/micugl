import type { RenderOptions, RenderPass, RenderPassUniformValue, UniformType } from '@/types';

export interface CompiledFboInput {
    kind: 'fbo';
    id: string;
    textureUnit: number;
    samplerName: string;
    isPingPong: boolean;
    pingPongUseReadIndex: boolean;
    staticIndex: number;
}

export interface CompiledSourceInput {
    kind: 'source';
    id: string;
    textureUnit: number;
    samplerName: string;
}

export type CompiledInput = CompiledFboInput | CompiledSourceInput;

export interface CompiledUniform {
    name: string;
    type: UniformType;
    value: RenderPassUniformValue;
}

export interface CompiledPass {
    programId: string;
    outputFramebuffer: string | null;
    outputIsPingPong: boolean;
    renderOptions: RenderOptions | undefined;
    inputs: CompiledInput[];
    uniforms: CompiledUniform[];
    swapIds: string[];
}

export function planPassSwaps(pass: RenderPass, isPingPong: (id: string) => boolean): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    const add = (id: string): void => {
        if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    };

    if (pass.outputFramebuffer != null && isPingPong(pass.outputFramebuffer)) {
        add(pass.outputFramebuffer);
    }

    for (const texture of pass.inputTextures) {
        if (texture.bindingType === 'readwrite' && isPingPong(texture.id)) {
            add(texture.id);
        }
    }

    return ids;
}

export function compilePass(pass: RenderPass, isPingPong: (id: string) => boolean): CompiledPass {
    const inputs: CompiledInput[] = pass.inputTextures.map(texture => {
        switch (texture.bindingType) {
            case 'source':
                return {
                    kind: 'source',
                    id: texture.id,
                    textureUnit: texture.textureUnit,
                    samplerName: texture.samplerName
                };
            case 'read':
            case 'write':
            case 'readwrite':
                return {
                    kind: 'fbo',
                    id: texture.id,
                    textureUnit: texture.textureUnit,
                    samplerName: texture.samplerName,
                    isPingPong: isPingPong(texture.id),
                    pingPongUseReadIndex: texture.bindingType === 'read' || texture.bindingType === 'readwrite',
                    staticIndex: texture.bindingType === 'read' ? 0 : 1
                };
            default: {
                const unreachable: never = texture.bindingType;
                throw new Error(
                    `micugl: pass on program "${pass.programId}" has a texture binding of type `
                    + `"${String(unreachable)}", which compilePass does not handle. This is a bug in micugl.`
                );
            }
        }
    });

    const uniforms: CompiledUniform[] = pass.uniforms
        ? Object.entries(pass.uniforms).map(([name, uniform]) => ({
            name,
            type: uniform.type,
            value: uniform.value
        }))
        : [];

    const outputFramebuffer = pass.outputFramebuffer ?? null;

    return {
        programId: pass.programId,
        outputFramebuffer,
        outputIsPingPong: outputFramebuffer != null && isPingPong(outputFramebuffer),
        renderOptions: pass.renderOptions,
        inputs,
        uniforms,
        swapIds: planPassSwaps(pass, isPingPong)
    };
}
