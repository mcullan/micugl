import type { RenderPass } from '@/core';
import type { WebGLManager } from '@/core';
import type { CompiledPass } from '@/core/lib/passPlanning';
import { compilePass } from '@/core/lib/passPlanning';

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

    execute(time: number): void {
        const gl = this.webglManager.context;
        const fbo = this.webglManager.fbo;

        this.compiled ??= this.compilePasses();

        for (const pass of this.compiled) {
            if (pass.outputFramebuffer !== null) {
                if (pass.outputIsPingPong) {
                    fbo.bindFramebuffer(pass.outputFramebuffer, fbo.getWriteIndex(pass.outputFramebuffer));
                } else {
                    fbo.bindFramebuffer(pass.outputFramebuffer);
                }
            } else {
                fbo.bindFramebuffer(null);
            }

            this.webglManager.prepareRender(pass.programId, pass.renderOptions);

            for (const input of pass.inputs) {
                let textureIndex = input.staticIndex;
                if (input.isPingPong) {
                    textureIndex = input.pingPongUseReadIndex
                        ? fbo.getReadIndex(input.id)
                        : fbo.getWriteIndex(input.id);
                }

                fbo.bindTexture(input.id, input.textureUnit, textureIndex);
                this.webglManager.setUniform(pass.programId, input.samplerName, input.textureUnit, 'sampler2D');
            }

            this.webglManager.updateUniforms(pass.programId, time);

            for (const uniform of pass.uniforms) {
                const value = typeof uniform.value === 'function'
                    ? uniform.value(time, gl.canvas.width, gl.canvas.height)
                    : uniform.value;

                this.webglManager.setUniform(pass.programId, uniform.name, value, uniform.type);
            }

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            for (const id of pass.swapIds) {
                fbo.swapTextures(id);
            }
        }
    }

    initializeResources(): void {
        for (const pass of this.passes) {
            const resources = this.webglManager.resources.get(pass.programId);
            if (resources && !('a_position' in resources.buffers)) {
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
}
