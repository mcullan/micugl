import type { WebGLManager } from '@/core/managers/WebGLManager';
import type { FramebufferOptions, RenderPass, RenderPassUniformValue, ShaderProgramConfig, UniformParam, UniformType } from '@/types';

export interface PostProcessEffect {
  id: string;
  programId: string;
  shaderConfig: ShaderProgramConfig;
  uniforms: Record<string, UniformParam>;
  enabled: boolean;
}

export interface PostProcessChain {
  id: string;
  effects: PostProcessEffect[];
  inputFramebufferId: string;
  outputFramebufferId: string | null;
  intermediateFramebufferIds: string[];
}

export class Postprocessing {
    private webglManager: WebGLManager;
    private effects = new Map<string, PostProcessEffect>();
    private chains = new Map<string, PostProcessChain>();
    private defaultFramebufferOptions: FramebufferOptions = {
        width: 0,
        height: 0,
        textureCount: 2,
        textureOptions: {
            minFilter: WebGLRenderingContext.LINEAR,
            magFilter: WebGLRenderingContext.LINEAR
        }
    };

    constructor(webglManager: WebGLManager) {
        this.webglManager = webglManager;
    }

    registerEffect(effect: PostProcessEffect): void {
        if (this.effects.has(effect.id)) {
            console.warn(`Effect with id ${effect.id} already exists, overwriting`);
        }

        if (!this.webglManager.resources.has(effect.programId)) {
            this.webglManager.createProgram(effect.programId, effect.shaderConfig);
        }

        this.effects.set(effect.id, effect);
    }

    removeEffect(effectId: string): void {
        if (!this.effects.has(effectId)) {
            console.warn(`Effect with id ${effectId} not found`);
            return;
        }

        this.effects.delete(effectId);
    }

    createChain(
        chainId: string, 
        effectIds: string[], 
        inputFramebufferId: string,
        outputFramebufferId: string | null = null,
        framebufferOptions: FramebufferOptions = this.defaultFramebufferOptions
    ): void {
        if (this.chains.has(chainId)) {
            console.warn(`Chain with id ${chainId} already exists, overwriting`);
        }

        const effects: PostProcessEffect[] = [];
        for (const effectId of effectIds) {
            const effect = this.effects.get(effectId);
            if (!effect) {
                throw new Error(`Effect with id ${effectId} not found`);
            }
            effects.push(effect);
        }

        const intermediateFramebufferIds: string[] = [];
        for (let i = 0; i < effects.length - 1; i++) {
            const fbId = `${chainId}-intermediate-${i}`;
            this.webglManager.fbo.createFramebuffer(fbId, framebufferOptions);
            intermediateFramebufferIds.push(fbId);
        }

        this.chains.set(chainId, {
            id: chainId,
            effects,
            inputFramebufferId,
            outputFramebufferId,
            intermediateFramebufferIds
        });
    }

    removeChain(chainId: string): void {
        const chain = this.chains.get(chainId);
        if (!chain) {
            console.warn(`Chain with id ${chainId} not found`);
            return;
        }

        chain.intermediateFramebufferIds.forEach(fbId => {
            this.webglManager.fbo.destroy(fbId);
        });

        this.chains.delete(chainId);
    }

    generatePasses(chainId: string, _time: number): RenderPass[] {
        const chain = this.chains.get(chainId);
        if (!chain) {
            throw new Error(`Chain with id ${chainId} not found`);
        }

        const passes: RenderPass[] = [];
        const enabledEffects = chain.effects.filter(effect => effect.enabled);

        if (enabledEffects.length === 0) {
            return [{
                programId: 'copy-shader',
                inputTextures: [{
                    id: chain.inputFramebufferId,
                    textureUnit: 0,
                    bindingType: 'read'
                }],
                outputFramebuffer: chain.outputFramebufferId,
                renderOptions: { clear: true }
            }];
        }

        enabledEffects.forEach((effect, index) => {
            const isFirst = index === 0;
            const isLast = index === enabledEffects.length - 1;
  
            const inputId = isFirst 
                ? chain.inputFramebufferId 
                : chain.intermediateFramebufferIds[index - 1];
  
            const outputId = isLast 
                ? chain.outputFramebufferId 
                : chain.intermediateFramebufferIds[index];
  
            const passUniforms: Record<string, { 
                type: UniformType; 
                value: RenderPassUniformValue;
            }> = {};
  
            Object.entries(effect.uniforms).forEach(([name, param]) => {
                const uniformName = name.startsWith('u_') ? name : `u_${name}`;
    
                passUniforms[uniformName] = {
                    type: param.type,
                    value: param.value
                };
            });
  
            passes.push({
                programId: effect.programId,
                inputTextures: [{
                    id: inputId,
                    textureUnit: 0,
                    bindingType: 'read'
                }],
                outputFramebuffer: outputId,
                uniforms: passUniforms,
                renderOptions: { clear: true }
            });
        });

        return passes;
    }

    process(chainId: string, time: number): void {
        const passes = this.generatePasses(chainId, time);
    
        for (const pass of passes) {
            if (pass.outputFramebuffer) {
                this.webglManager.fbo.bindFramebuffer(pass.outputFramebuffer);
            } else {
                this.webglManager.fbo.bindFramebuffer(null);
            }
      
            this.webglManager.prepareRender(pass.programId, pass.renderOptions);
      
            pass.inputTextures.forEach(texture => {
                this.webglManager.fbo.bindTexture(texture.id, texture.textureUnit);
                this.webglManager.setUniform(
                    pass.programId,
                    `u_texture${texture.textureUnit}`,
                    texture.textureUnit,
                    'sampler2D'
                );
            });
      
            if (pass.uniforms) {
                Object.entries(pass.uniforms).forEach(([name, uniform]) => {
                    const value = typeof uniform.value === 'function'
                        ? uniform.value(time, this.webglManager.context.canvas.width, this.webglManager.context.canvas.height)
                        : uniform.value;
          
                    this.webglManager.setUniform(
                        pass.programId, 
                        name, 
                        value, 
                        uniform.type
                    );
                });
            }
      
            this.webglManager.context.drawArrays(
                this.webglManager.context.TRIANGLE_STRIP, 
                0, 
                4
            );
        }
    }

    resizeFramebuffers(width: number, height: number): void {
        for (const chain of this.chains.values()) {
            for (const fbId of chain.intermediateFramebufferIds) {
                this.webglManager.fbo.resizeFramebuffer(fbId, width, height);
            }
        }
    }

    destroyAll(): void {
        for (const chain of this.chains.values()) {
            for (const fbId of chain.intermediateFramebufferIds) {
                this.webglManager.fbo.destroy(fbId);
            }
        }
        this.chains.clear();
        this.effects.clear();
    }
}
