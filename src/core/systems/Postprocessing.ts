import { GL_LINEAR } from '@/core/lib/glConstants';
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

const COPY_PROGRAM_ID = 'copy-shader';

const COPY_SHADER_CONFIG: ShaderProgramConfig = {
    vertexShader: `
        attribute vec2 a_position;
        varying vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_position * 0.5 + 0.5;
        }
    `,
    fragmentShader: `
        precision mediump float;
        uniform sampler2D u_texture0;
        varying vec2 v_texCoord;
        void main() {
            gl_FragColor = texture2D(u_texture0, v_texCoord);
        }
    `,
    uniforms: [{ name: 'u_texture0', type: 'sampler2D' }]
};

export class Postprocessing {
    private webglManager: WebGLManager;
    private effects = new Map<string, PostProcessEffect>();
    private chains = new Map<string, PostProcessChain>();
    private passCache = new Map<string, { key: string; passes: RenderPass[] }>();
    private defaultFramebufferOptions: FramebufferOptions = {
        width: 0,
        height: 0,
        textureCount: 1,
        textureOptions: {
            minFilter: GL_LINEAR,
            magFilter: GL_LINEAR
        }
    };

    constructor(webglManager: WebGLManager) {
        this.webglManager = webglManager;
    }

    private ensureCopyProgram(): void {
        if (this.webglManager.resources.has(COPY_PROGRAM_ID)) {
            return;
        }

        this.webglManager.createProgram(COPY_PROGRAM_ID, COPY_SHADER_CONFIG);
        this.webglManager.createBuffer(
            COPY_PROGRAM_ID,
            'a_position',
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
        );
        this.webglManager.setAttributeOnce(COPY_PROGRAM_ID, 'a_position', {
            name: 'a_position',
            size: 2,
            type: 'FLOAT',
            normalized: false,
            stride: 0,
            offset: 0
        });
    }

    registerEffect(effect: PostProcessEffect): void {
        if (this.effects.has(effect.id)) {
            console.warn(`Effect with id ${effect.id} already exists, overwriting`);
        }

        if (!this.webglManager.resources.has(effect.programId)) {
            this.webglManager.createProgram(effect.programId, effect.shaderConfig);
        }

        this.effects.set(effect.id, effect);
        this.passCache.clear();
    }

    removeEffect(effectId: string): void {
        const effect = this.effects.get(effectId);
        if (!effect) {
            console.warn(`Effect with id ${effectId} not found`);
            return;
        }

        this.effects.delete(effectId);

        const stillUsed = Array.from(this.effects.values())
            .some(other => other.programId === effect.programId);

        if (!stillUsed && this.webglManager.resources.has(effect.programId)) {
            this.webglManager.destroy(effect.programId);
        }

        this.passCache.clear();
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
        this.passCache.clear();
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
        this.passCache.delete(chainId);
    }

    private buildPasses(chain: PostProcessChain, enabledEffects: PostProcessEffect[]): RenderPass[] {
        if (enabledEffects.length === 0) {
            return [{
                programId: COPY_PROGRAM_ID,
                inputTextures: [{
                    id: chain.inputFramebufferId,
                    textureUnit: 0,
                    bindingType: 'read',
                    samplerName: 'u_texture0'
                }],
                outputFramebuffer: chain.outputFramebufferId,
                renderOptions: { clear: true }
            }];
        }

        const passes: RenderPass[] = [];

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
                    bindingType: 'read',
                    samplerName: 'u_texture0'
                }],
                outputFramebuffer: outputId,
                uniforms: passUniforms,
                renderOptions: { clear: true }
            });
        });

        return passes;
    }

    private assertUniformsDeclared(passes: RenderPass[]): void {
        for (const pass of passes) {
            if (pass.programId === COPY_PROGRAM_ID) {
                this.ensureCopyProgram();
            }

            for (const texture of pass.inputTextures) {
                this.webglManager.assertUniformDeclared(pass.programId, texture.samplerName, 'sampler2D');
            }

            for (const [name, uniform] of Object.entries(pass.uniforms ?? {})) {
                this.webglManager.assertUniformDeclared(pass.programId, name, uniform.type);
            }
        }
    }

    generatePasses(chainId: string, _time: number): RenderPass[] {
        const chain = this.chains.get(chainId);
        if (!chain) {
            throw new Error(`Chain with id ${chainId} not found`);
        }

        const enabledEffects = chain.effects.filter(effect => effect.enabled);
        const key = enabledEffects.map(effect => effect.id).join('|');

        const cached = this.passCache.get(chainId);
        if (cached && cached.key === key) {
            return cached.passes;
        }

        const passes = this.buildPasses(chain, enabledEffects);
        this.assertUniformsDeclared(passes);
        this.passCache.set(chainId, { key, passes });
        return passes;
    }

    process(chainId: string, time: number): void {
        const passes = this.generatePasses(chainId, time);
        const gl = this.webglManager.context;

        for (const pass of passes) {
            if (pass.programId === COPY_PROGRAM_ID) {
                this.ensureCopyProgram();
            }

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
                    texture.samplerName,
                    texture.textureUnit,
                    'sampler2D'
                );
            });

            if (pass.uniforms) {
                Object.entries(pass.uniforms).forEach(([name, uniform]) => {
                    const value = typeof uniform.value === 'function'
                        ? uniform.value(time, gl.canvas.width, gl.canvas.height)
                        : uniform.value;

                    this.webglManager.setUniform(pass.programId, name, value, uniform.type);
                });
            }

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
        const programIds = new Set<string>();

        for (const chain of this.chains.values()) {
            for (const fbId of chain.intermediateFramebufferIds) {
                this.webglManager.fbo.destroy(fbId);
            }
        }

        for (const effect of this.effects.values()) {
            programIds.add(effect.programId);
        }
        programIds.add(COPY_PROGRAM_ID);

        for (const programId of programIds) {
            if (this.webglManager.resources.has(programId)) {
                this.webglManager.destroy(programId);
            }
        }

        this.chains.clear();
        this.effects.clear();
        this.passCache.clear();
    }
}
