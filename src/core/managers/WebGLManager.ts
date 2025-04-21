import type {
    AttributeConfig,
    RenderOptions,
    ShaderAttributeLocations,
    ShaderProgramConfig,
    ShaderResources,
    ShaderUniformLocations,
    UniformType,
    UniformUpdateFn,
    WebGLExtensionName,
    WebGLExtensionTypes
} from '@/core';
import { FBOManager } from '@/core';
import type { TypedFloat32Array, UniformTypeMap } from '@/types';

declare global {
    interface WebGLRenderingContext {
        vertexAttribDivisor: ((index: number, divisor: number) => void) | undefined;
    }
}

export class WebGLManager {
    private gl: WebGLRenderingContext;
    private fboManager: FBOManager;
  
    resources = new Map<string, ShaderResources>();
    private compileCache = new Map<string, WebGLShader>();
    private uniformUpdateFns = new Map<string, Map<string, UniformUpdateFn<UniformType>>>();
    private extensions = new Map<string, any>();

    constructor(canvas: HTMLCanvasElement, options?: WebGLContextAttributes) {
        const defaultOptions: WebGLContextAttributes = {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            powerPreference: 'low-power',
            preserveDrawingBuffer: false
        };

        const ctx = canvas.getContext('webgl', { ...defaultOptions, ...options });
        if (!ctx) {
            throw new Error('WebGL not supported');
        }

        this.gl = ctx;
        this.fboManager = new FBOManager(ctx);
    
        this.getExtension('OES_texture_float');
        this.getExtension('OES_texture_float_linear');
        this.getExtension('OES_vertex_array_object');
        this.getExtension('ANGLE_instanced_arrays');
    }
    getExtension<K extends WebGLExtensionName>(name: K): WebGLExtensionTypes[K] | null {
        if (this.extensions.has(name)) {
            return this.extensions.get(name) as WebGLExtensionTypes[K] | null;
        }
        
        const extension = this.gl.getExtension(name) as WebGLExtensionTypes[K] | null;

        this.extensions.set(name, extension);
        return extension;
    }

    createProgram(id: string, config: ShaderProgramConfig): ShaderResources {
        const { vertexShader, fragmentShader, uniforms, attributes } = config;
        const gl = this.gl;

        const vShader = this.getOrCompileShader('vertex:' + vertexShader, gl.VERTEX_SHADER, vertexShader);
        const fShader = this.getOrCompileShader('fragment:' + fragmentShader, gl.FRAGMENT_SHADER, fragmentShader);

        const program = gl.createProgram();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!program) {
            throw new Error('Failed to create WebGL program');
        }

        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Could not link shader program: ${info}`);
        }

        const uniformLocations: ShaderUniformLocations = {};
        for (const uniform of uniforms) {
            uniformLocations[uniform.name] = gl.getUniformLocation(program, uniform.name);
        }

        const attributeLocations: ShaderAttributeLocations = {};
        if (attributes){
            for (const attribute of attributes) {
                attributeLocations[attribute.name] = gl.getAttribLocation(program, attribute.name);
            }
        }

        const resources: ShaderResources = {
            program,
            uniforms: uniformLocations,
            attributes: attributeLocations,
            buffers: {}
        };

        this.resources.set(id, resources);
        this.uniformUpdateFns.set(id, new Map());
    
        return resources;
    }

    private getOrCompileShader(cacheKey: string, type: number, source: string): WebGLShader {
        if (this.compileCache.has(cacheKey)) {
            const cachedShader = this.compileCache.get(cacheKey);
            if (cachedShader) {
                return cachedShader;
            }
        }

        const shader = this.compileShader(type, source);
        this.compileCache.set(cacheKey, shader);
        return shader;
    }

    private compileShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type);

        if (!shader) {
            throw new Error('Failed to create shader');
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${info}`);
        }

        return shader;
    }

    createBuffer(programId: string, attributeName: string, data: Float32Array | Uint8Array | Uint16Array): WebGLBuffer {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

         
        const buffer = gl.createBuffer();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!buffer) {
            throw new Error('Failed to create buffer');
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        resources.buffers[attributeName] = { buffer, data };
        return buffer;
    }

    updateBuffer(programId: string, attributeName: string, data: Float32Array | Uint8Array | Uint16Array): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        const bufferData = resources.buffers[attributeName];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!bufferData) {
            throw new Error(`Buffer for attribute ${attributeName} not found`);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        bufferData.data = data;
    }

   
    registerUniformUpdater<T extends UniformType>(
        programId: string,
        uniformName: string,
        type: T,
        updateFn: UniformUpdateFn<T>
    ): void {
        const resources = this.resources.get(programId);
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        const programUniforms = this.uniformUpdateFns.get(programId);
        if (!programUniforms) {
            throw new Error(`Program uniforms for id ${programId} not found`);
        }
    
        const location = resources.uniforms[uniformName];
        if (location === null) {
            return;
        }

        const gl = this.gl;
        let updateFunction: UniformUpdateFn<UniformType>;

        switch (type) {
            case 'int':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as number;
                    gl.uniform1i(location, value);
                    return value;
                };
                break;
            case 'float':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as number;
                    gl.uniform1f(location, value);
                    return value;
                };
                break;
            case 'sampler2D':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as number;
                    gl.uniform1i(location, value);
                    return value;
                };
                break;

            case 'vec2':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<2>;
                    gl.uniform2fv(location, value);
                    return value;
                };
                break;
            case 'vec3':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<3>;
                    gl.uniform3fv(location, value);
                    return value;
                };
                break;
            case 'vec4':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<4>;
                    gl.uniform4fv(location, value);
                    return value;
                };
                break;

            case 'mat2':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<4>;
                    gl.uniformMatrix2fv(location, false, value);
                    return value;
                };
                break;
            case 'mat3':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<9>;
                    gl.uniformMatrix3fv(location, false, value);
                    return value;
                };
                break;
            case 'mat4':
                updateFunction = (time, width, height) => {
                    const value = updateFn(time, width, height) as TypedFloat32Array<16>;
                    gl.uniformMatrix4fv(location, false, value);
                    return value;
                };
                break;
            
            default:
                throw new Error(`Unsupported uniform type: ${type}`);
        }

        programUniforms.set(uniformName, updateFunction);
    }

    updateUniforms(programId: string, time: number): void {
        const programUniforms = this.uniformUpdateFns.get(programId);
        if (!programUniforms) {
            return;
        }

        const canvas = this.gl.canvas as HTMLCanvasElement;
        const width = canvas.width;
        const height = canvas.height;

        programUniforms.forEach(updateFn => {
            updateFn(time, width, height);
        });
    }

    setSize(width: number, height: number, useDevicePixelRatio = true): void {
        const canvas = this.gl.canvas as HTMLCanvasElement;
        const dpr = useDevicePixelRatio ? (window.devicePixelRatio || 1) : 1;

        const scaledWidth = Math.floor(width * dpr);
        const scaledHeight = Math.floor(height * dpr);

        if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
            canvas.width = scaledWidth;
            canvas.height = scaledHeight;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            this.gl.viewport(0, 0, scaledWidth, scaledHeight);
        }
    }

    prepareRender(programId: string, options: RenderOptions = {}): void {
        const { clear = true, clearColor = [0, 0, 0, 1] } = options;
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        gl.useProgram(resources.program);

        if (clear) {
            gl.clearColor(...clearColor);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    fastRender(programId: string, time: number, clear = true): void {
        const gl = this.gl;

        const resources = this.resources.get(programId);
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }
        gl.useProgram(resources.program);

        if (clear) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        this.updateUniforms(programId, time);
    }

    setUniform<T extends UniformType>(
        programId: string, 
        uniformName: string, 
        value: UniformTypeMap[T], 
        type: T
    ): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);
  
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }
  
        const location = resources.uniforms[uniformName];
        if (location === null) {
            return;
        }
  
        gl.useProgram(resources.program);
  
        switch (type) {
            case 'float':
                gl.uniform1f(location, value as number);
                break;
            case 'vec2':
                gl.uniform2fv(location, value as Float32Array | [number, number]);
                break;
            case 'vec3':
                gl.uniform3fv(location, value as Float32Array | [number, number, number]);
                break;
            case 'vec4':
                gl.uniform4fv(location, value as Float32Array | [number, number, number, number]);
                break;
            case 'int':
                gl.uniform1i(location, value as number);
                break;
            case 'mat2':
                gl.uniformMatrix2fv(location, false, value as Float32Array | [number, number, number, number]);
                break;
            case 'mat3':
                gl.uniformMatrix3fv(location, false, value as Float32Array | [number, number, number, number, number, number, number, number, number]);
                break;
            case 'mat4':
                gl.uniformMatrix4fv(location, false, value as Float32Array | [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]);
                break;
            case 'sampler2D':
                gl.uniform1i(location, value as number);
                break;
            default:
                throw new Error(`Unsupported uniform type: ${type}`);
        }
    }

    setAttributeOnce(programId: string, attributeName: string, config: AttributeConfig): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        const location = resources.attributes[attributeName];
        if (location === -1) {
            console.warn(`Attribute ${attributeName} not found or is unused`);
            return;
        }

        const bufferData = resources.buffers[attributeName];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!bufferData) {
            throw new Error(`Buffer for attribute ${attributeName} not found`);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(
            location,
            config.size,
            gl[config.type],
            config.normalized,
            config.stride,
            config.offset
        );

        if (config.instanced) {
            const instancedExt = this.getExtension('ANGLE_instanced_arrays');
            if (instancedExt?.vertexAttribDivisorANGLE) {
                instancedExt.vertexAttribDivisorANGLE(location, 1);
            } else if (gl.vertexAttribDivisor) {
                gl.vertexAttribDivisor(location, 1);
            } else {
                throw new Error('Instanced rendering not supported');
            }
        }
    }

    drawArrays(mode: number, first: number, count: number): void {
        this.gl.drawArrays(mode, first, count);
    }

    drawElements(mode: number, count: number, type: number, offset: number): void {
        this.gl.drawElements(mode, count, type, offset);
    }

    destroy(programId: string): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) return;

        Object.values(resources.buffers).forEach(({ buffer }) => {
            gl.deleteBuffer(buffer);
        });

        gl.deleteProgram(resources.program);
        this.resources.delete(programId);
        this.uniformUpdateFns.delete(programId);
    }

    destroyAll(): void {
        for (const id of Array.from(this.resources.keys())) {
            this.destroy(id);
        }

        this.compileCache.clear();
        this.fboManager.destroyAll();
    }

    get context(): WebGLRenderingContext {
        return this.gl;
    }

    get fbo(): FBOManager {
        return this.fboManager;
    }
}
