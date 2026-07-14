import type { RenderPass } from '@/core';
import type { WebGLManager } from '@/core';
import type { CompiledPass } from '@/core/lib/passPlanning';
import { compilePass } from '@/core/lib/passPlanning';
import { chainIsTimePure } from '@/core/lib/passPurity';
import type { Vec4 } from '@/types';

export class Passes {
    private webglManager: WebGLManager;
    private passes: RenderPass[] = [];
    private pingPongIds = new Set<string>();
    private compiled: CompiledPass[] | null = null;

    constructor(webglManager: WebGLManager) {
        this.webglManager = webglManager;
    }

    addPass(pass: RenderPass): void {
        this.passes.push(pass);

        if (pass.outputFramebuffer) {
            this.pingPongIds.add(pass.outputFramebuffer);
        }

        pass.inputTextures.forEach(texture => {
            if (texture.bindingType === 'readwrite') {
                this.pingPongIds.add(texture.id);
            }
        });

        this.compiled = null;
    }

    clearPasses(): void {
        this.passes = [];
        this.pingPongIds.clear();
        this.compiled = null;
    }

    private compilePasses(): CompiledPass[] {
        const isPingPong = (id: string): boolean => this.pingPongIds.has(id);
        return this.passes.map(pass => compilePass(pass, isPingPong));
    }

    private runCompiledPass(pass: CompiledPass, time: number, width: number, height: number): void {
        const gl = this.webglManager.context;
        const fbo = this.webglManager.fbo;

        this.webglManager.prepareRender(pass.programId, pass.renderOptions);

        let boundSource = false;
        for (const input of pass.inputs) {
            if (input.kind === 'source') {
                this.webglManager.textures.bindToUnit(input.id, input.textureUnit);
                this.webglManager.textures.uploadIfStaleById(input.id);
                this.webglManager.setUniform(pass.programId, input.samplerName, input.textureUnit, 'sampler2D');
                boundSource = true;
                continue;
            }

            let textureIndex = input.staticIndex;
            if (input.isPingPong) {
                textureIndex = input.pingPongUseReadIndex
                    ? fbo.getReadIndex(input.id)
                    : fbo.getWriteIndex(input.id);
            }

            fbo.bindTexture(input.id, input.textureUnit, textureIndex);
            this.webglManager.setUniform(pass.programId, input.samplerName, input.textureUnit, 'sampler2D');
        }

        if (boundSource) {
            gl.activeTexture(gl.TEXTURE0);
        }

        this.webglManager.updateUniforms(pass.programId, time, width, height);

        for (const uniform of pass.uniforms) {
            const value = typeof uniform.value === 'function'
                ? uniform.value(time, width, height)
                : uniform.value;

            this.webglManager.setUniform(pass.programId, uniform.name, value, uniform.type);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    execute(time: number, width?: number, height?: number): void {
        const gl = this.webglManager.context;
        const fbo = this.webglManager.fbo;

        this.compiled ??= this.compilePasses();

        const resolvedWidth = width ?? gl.canvas.width;
        const resolvedHeight = height ?? gl.canvas.height;

        for (const pass of this.compiled) {
            let passWidth = resolvedWidth;
            let passHeight = resolvedHeight;

            if (pass.outputFramebuffer !== null) {
                const size = fbo.getSize(pass.outputFramebuffer);
                passWidth = size.width;
                passHeight = size.height;

                if (pass.outputIsPingPong) {
                    fbo.bindFramebuffer(pass.outputFramebuffer, fbo.getWriteIndex(pass.outputFramebuffer));
                } else {
                    fbo.bindFramebuffer(pass.outputFramebuffer);
                }
            } else {
                fbo.bindFramebuffer(null);
            }

            this.runCompiledPass(pass, time, passWidth, passHeight);

            for (const id of pass.swapIds) {
                fbo.swapTextures(id);
            }
        }
    }

    reset(color?: Vec4): void {
        const gl = this.webglManager.context;
        const fbo = this.webglManager.fbo;
        const [r, g, b, a] = color ?? [0, 0, 0, 0];

        for (const id of this.pingPongIds) {
            const textureCount = fbo.getTextureCount(id);
            for (let index = 0; index < textureCount; index++) {
                fbo.bindFramebuffer(id, index);
                gl.clearColor(r, g, b, a);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        }

        fbo.bindFramebuffer(null);
    }

    renderFinalPassTo(targetFboId: string, width: number, height: number, time: number): void {
        const fbo = this.webglManager.fbo;

        this.compiled ??= this.compilePasses();

        if (this.compiled.length === 0) {
            throw new Error('Passes.renderFinalPassTo: no passes to render');
        }

        const lastPass = this.compiled[this.compiled.length - 1];
        if (lastPass.outputFramebuffer !== null) {
            throw new Error('Passes.renderFinalPassTo: final pass does not render to canvas');
        }

        fbo.bindFramebuffer(targetFboId);
        this.runCompiledPass(lastPass, time, width, height);
    }

    isTimePure(): boolean {
        return chainIsTimePure(this.passes);
    }

    private assertUniformsDeclared(pass: CompiledPass): void {
        for (const input of pass.inputs) {
            if (input.kind === 'source') {
                if (!this.webglManager.textures.has(input.id)) {
                    throw new Error(
                        `Passes.initializeResources: pass on program "${pass.programId}" samples source texture `
                        + `"${input.id}", but no such source texture is defined. Call `
                        + 'TextureManager.defineTexture(source) for it before initializing the passes, or the sampler '
                        + 'would read the 1x1 placeholder for the life of the program.'
                    );
                }
                this.webglManager.assertSourceSamplerLocation(pass.programId, input.samplerName);
                continue;
            }
            this.webglManager.assertUniformDeclared(pass.programId, input.samplerName, 'sampler2D');
        }

        for (const uniform of pass.uniforms) {
            this.webglManager.assertUniformDeclared(pass.programId, uniform.name, uniform.type);
        }
    }

    initializeResources(): void {
        this.compiled ??= this.compilePasses();

        for (const pass of this.compiled) {
            const resources = this.webglManager.resources.get(pass.programId);
            if (!resources) {
                throw new Error(`Program with id ${pass.programId} not found`);
            }

            this.assertUniformsDeclared(pass);

            if ('a_position' in resources.buffers) {
                continue;
            }

            this.webglManager.createBuffer(
                pass.programId,
                'a_position',
                new Float32Array([
                    -1.0, -1.0,
                    1.0, -1.0,
                    -1.0, 1.0,
                    1.0, 1.0,
                ])
            );

            this.webglManager.setAttributeOnce(pass.programId, 'a_position', {
                name: 'a_position',
                size: 2,
                type: 'FLOAT',
                normalized: false,
                stride: 0,
                offset: 0
            });
        }
    }
}
