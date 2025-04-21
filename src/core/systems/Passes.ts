import type { RenderPass } from '@/core';
import type { WebGLManager } from '@/core';

export class Passes {
    private webglManager: WebGLManager;
    private passes: RenderPass[] = [];
    private pingPongIds = new Set<string>();

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
    }

    clearPasses(): void {
        this.passes = [];
        this.pingPongIds.clear();
    }

    execute(time: number): void {
        const gl = this.webglManager.context;
        const fbo = this.webglManager.fbo;
    
        for (const pass of this.passes) {
            if (pass.outputFramebuffer) {
                if (this.pingPongIds.has(pass.outputFramebuffer)) {
                    const { write } = fbo.getPingPongIndices(pass.outputFramebuffer);
                    fbo.bindFramebuffer(pass.outputFramebuffer, write);
                } else {
                    fbo.bindFramebuffer(pass.outputFramebuffer);
                }
            } else {
                fbo.bindFramebuffer(null);
            }
      
            this.webglManager.prepareRender(pass.programId, pass.renderOptions);
      
            pass.inputTextures.forEach(texture => {
                let textureIndex = texture.bindingType === 'read' ? 0 : 1;
        
                if (this.pingPongIds.has(texture.id)) {
                    const { read, write } = fbo.getPingPongIndices(texture.id);
                    textureIndex = texture.bindingType === 'read' || texture.bindingType === 'readwrite' 
                        ? read : write;
                }
        
                fbo.bindTexture(texture.id, texture.textureUnit, textureIndex);
        
                this.webglManager.setUniform(
                    pass.programId,
          `u_${texture.id}`,
          texture.textureUnit,
          'sampler2D'
                );
            });
      
            this.webglManager.updateUniforms(pass.programId, time);
      
            if (pass.uniforms) {
                Object.entries(pass.uniforms).forEach(([name, uniform]) => {
                    const value = typeof uniform.value === 'function'
                        ? uniform.value(time, gl.canvas.width, gl.canvas.height)
                        : uniform.value;
          
                    this.webglManager.setUniform(
                        pass.programId, 
                        name, 
                        value, 
                        uniform.type
                    );
                });
            }
      
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
            if (pass.outputFramebuffer && this.pingPongIds.has(pass.outputFramebuffer)) {
                fbo.swapTextures(pass.outputFramebuffer);
            }
      
            pass.inputTextures.forEach(texture => {
                if (texture.bindingType === 'readwrite' && this.pingPongIds.has(texture.id)) {
                    fbo.swapTextures(texture.id);
                }
            });
        }
    }
  
    initializeResources(): void {
        for (const pass of this.passes) {
            const resources = this.webglManager.resources.get(pass.programId);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (resources && !resources.buffers.a_position) {
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
