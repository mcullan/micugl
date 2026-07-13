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
import { validateTextureUnit } from '@/core/lib/sourceTextureOptions';
import { createScalarUpdater, createVectorUpdater } from '@/core/lib/uniformDirtyCheck';
import type { ActiveUniformInfo } from '@/core/lib/uniformReflection';
import { activeUniformTypes, uploadReaches } from '@/core/lib/uniformReflection';
import { TextureManager } from '@/core/managers/TextureManager';
import type { ActiveUniformTypes, BufferData, TextureBindingSpec, UniformTypeMap } from '@/types';

declare global {
    interface WebGLRenderingContext {
        vertexAttribDivisor: ((index: number, divisor: number) => void) | undefined;
        drawArraysInstanced: ((mode: number, first: number, count: number, instanceCount: number) => void) | undefined;
    }
}

export type WebGLManagerCanvas = HTMLCanvasElement | OffscreenCanvas;

export class WebGLManager {
    private gl: WebGLRenderingContext;
    private fboManager: FBOManager;
    private textureManager: TextureManager;

    resources = new Map<string, ShaderResources>();
    private compileCache = new Map<string, WebGLShader>();
    private uniformUpdateFns = new Map<string, Map<string, UniformUpdateFn<UniformType>>>();
    private textureBindings = new Map<string, TextureBindingSpec[]>();
    private extensions = new Map<string, any>();
    private currentProgram: WebGLProgram | null = null;

    constructor(canvas: WebGLManagerCanvas, options?: WebGLContextAttributes) {
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
        this.textureManager = new TextureManager(ctx);

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

        const program = gl.createProgram() as WebGLProgram | null;
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

        const uniformLocations = Object.create(null) as ShaderUniformLocations;
        for (const uniform of uniforms) {
            uniformLocations[uniform.name] = gl.getUniformLocation(program, uniform.name);
        }

        const attributeLocations: ShaderAttributeLocations = {};
        if (attributes){
            for (const attribute of attributes) {
                attributeLocations[attribute.name] = gl.getAttribLocation(program, attribute.name);
            }
        }

        const activeUniforms = this.reflectActiveUniforms(program);

        for (const uniform of uniforms) {
            const active = activeUniforms[uniform.name];
            if (active && !uploadReaches(active, uniform.type)) {
                gl.deleteProgram(program);
                throw new Error(
                    `Uniform "${uniform.name}" on program "${id}" is a ${active.glslType} in the shader source, `
                    + `but the uniformNames passed to createShaderConfig declare it as a ${uniform.type}. `
                    + 'Make the two agree.'
                );
            }
        }

        const resources: ShaderResources = {
            program,
            uniforms: uniformLocations,
            activeUniforms,
            attributes: attributeLocations,
            buffers: {}
        };

        this.resources.set(id, resources);
        this.uniformUpdateFns.set(id, new Map());
    
        return resources;
    }

    private reflectActiveUniforms(program: WebGLProgram): ActiveUniformTypes {
        const gl = this.gl;
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
        const infos: ActiveUniformInfo[] = [];

        for (let index = 0; index < count; index++) {
            const info = gl.getActiveUniform(program, index);
            if (info) {
                infos.push({ name: info.name, type: info.type, size: info.size });
            }
        }

        return activeUniformTypes(infos);
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

    createBuffer(
        programId: string,
        attributeName: string,
        data: Float32Array | Uint8Array | Uint16Array,
        usage: 'static' | 'dynamic' = 'static'
    ): WebGLBuffer {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }


        const buffer = gl.createBuffer() as WebGLBuffer | null;
        if (!buffer) {
            throw new Error('Failed to create buffer');
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, usage === 'dynamic' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);

        resources.buffers[attributeName] = { buffer, data, allocatedByteLength: data.byteLength };
        return buffer;
    }

    updateBuffer(programId: string, attributeName: string, data: Float32Array | Uint8Array | Uint16Array): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        const bufferData = resources.buffers[attributeName] as BufferData | undefined;
        if (!bufferData) {
            throw new Error(`Buffer for attribute ${attributeName} not found`);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        bufferData.data = data;
        bufferData.allocatedByteLength = data.byteLength;
    }

    updateBufferSub(
        programId: string,
        attributeName: string,
        data: Float32Array | Uint8Array | Uint16Array,
        offset = 0
    ): void {
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        const bufferData = resources.buffers[attributeName] as BufferData | undefined;
        if (!bufferData) {
            throw new Error(`Buffer for attribute ${attributeName} not found`);
        }

        if (offset + data.byteLength > bufferData.allocatedByteLength) {
            throw new Error(
                `updateBufferSub for attribute ${attributeName} would write past the allocated buffer: ` +
                `offset ${offset} + ${data.byteLength} bytes exceeds ${bufferData.allocatedByteLength} allocated bytes`
            );
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, offset, data);
    }

    private checkedUniformLocation(
        resources: ShaderResources,
        programId: string,
        uniformName: string,
        type: UniformType
    ): WebGLUniformLocation | null {
        const location = resources.uniforms[uniformName];

        if (location === undefined) {
            throw new Error(
                `Uniform "${uniformName}" is uploaded to program "${programId}" but was never declared for it. `
                + 'Declare it in the uniformNames passed to createShaderConfig, or stop uploading it.'
            );
        }

        if (location === null) {
            return null;
        }

        const active = resources.activeUniforms[uniformName];
        if (active && !uploadReaches(active, type)) {
            throw new Error(
                `Uniform "${uniformName}" on program "${programId}" is a ${active.glslType} in the shader source, `
                + `but is uploaded as a ${type}. Upload it as a ${active.glslType}, or change the shader source and `
                + 'the uniformNames passed to createShaderConfig.'
            );
        }

        return location;
    }

    assertUniformDeclared(programId: string, uniformName: string, type: UniformType): void {
        const resources = this.resources.get(programId);
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        this.checkedUniformLocation(resources, programId, uniformName, type);
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

        const location = this.checkedUniformLocation(resources, programId, uniformName, type);
        if (location === null) {
            return;
        }

        const gl = this.gl;
        let updateFunction: UniformUpdateFn<UniformType>;

        switch (type) {
            case 'int':
            case 'sampler2D':
                updateFunction = createScalarUpdater(updateFn, value => { gl.uniform1i(location, value) });
                break;
            case 'float':
                updateFunction = createScalarUpdater(updateFn, value => { gl.uniform1f(location, value) });
                break;
            case 'vec2':
                updateFunction = createVectorUpdater(2, updateFn, buffer => { gl.uniform2fv(location, buffer) });
                break;
            case 'vec3':
                updateFunction = createVectorUpdater(3, updateFn, buffer => { gl.uniform3fv(location, buffer) });
                break;
            case 'vec4':
                updateFunction = createVectorUpdater(4, updateFn, buffer => { gl.uniform4fv(location, buffer) });
                break;
            case 'mat2':
                updateFunction = createVectorUpdater(4, updateFn, buffer => { gl.uniformMatrix2fv(location, false, buffer) });
                break;
            case 'mat3':
                updateFunction = createVectorUpdater(9, updateFn, buffer => { gl.uniformMatrix3fv(location, false, buffer) });
                break;
            case 'mat4':
                updateFunction = createVectorUpdater(16, updateFn, buffer => { gl.uniformMatrix4fv(location, false, buffer) });
                break;
            default:
                throw new Error(`Unsupported uniform type: ${type}`);
        }

        programUniforms.set(uniformName, updateFunction);
    }

    registerTextureBinding(programId: string, binding: TextureBindingSpec): void {
        const resources = this.resources.get(programId);
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        validateTextureUnit(binding.unit, this.textureManager.maxTextureImageUnits());

        const bindings = this.textureBindings.get(programId) ?? [];

        for (const existing of bindings) {
            if (existing.unit === binding.unit) {
                throw new Error(
                    `WebGLManager.registerTextureBinding: texture unit ${binding.unit} on program "${programId}" is `
                    + `already bound to source "${existing.source.id}", so binding "${binding.source.id}" to it too `
                    + 'would leave one of the two sampling the other\'s pixels. Give each texture its own unit.'
                );
            }
            if (existing.source.id === binding.source.id) {
                throw new Error(
                    `WebGLManager.registerTextureBinding: source "${binding.source.id}" is already bound on program `
                    + `"${programId}" at unit ${existing.unit}. A source texture id is bound once per program.`
                );
            }
            if (existing.samplerName === binding.samplerName) {
                throw new Error(
                    `WebGLManager.registerTextureBinding: sampler "${binding.samplerName}" on program "${programId}" `
                    + `already samples source "${existing.source.id}" at unit ${existing.unit}. One sampler uniform `
                    + `holds one texture unit, so pointing it at "${binding.source.id}" too would leave the shader `
                    + 'reading only whichever was registered last. Give each texture its own sampler.'
                );
            }
        }

        this.textureManager.defineTexture(binding.source);

        bindings.push(binding);
        this.textureBindings.set(programId, bindings);

        this.setSamplerUnit(resources, programId, binding);
    }

    private setSamplerUnit(resources: ShaderResources, programId: string, binding: TextureBindingSpec): void {
        const location = this.checkedUniformLocation(resources, programId, binding.samplerName, 'sampler2D');
        if (location === null) {
            throw new Error(
                `WebGLManager.registerTextureBinding: the shader on program "${programId}" never samples `
                + `"${binding.samplerName}", so binding a texture to it can never affect the picture. Sample it in `
                + 'the shader, fix the sampler name, or remove its entry from the "textures" prop.'
            );
        }

        this.useProgram(resources.program);
        this.gl.uniform1i(location, binding.unit);
    }

    updateTextures(programId: string): void {
        const bindings = this.textureBindings.get(programId);
        if (!bindings) {
            return;
        }

        for (const { unit, source } of bindings) {
            this.textureManager.bindToUnit(source.id, unit);
            this.textureManager.uploadIfStale(source);
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
    }

    updateUniforms(programId: string, time: number, width?: number, height?: number): void {
        const programUniforms = this.uniformUpdateFns.get(programId);
        if (!programUniforms) {
            return;
        }

        const canvas = this.gl.canvas;
        const resolvedWidth = width ?? canvas.width;
        const resolvedHeight = height ?? canvas.height;

        programUniforms.forEach(updateFn => {
            updateFn(time, resolvedWidth, resolvedHeight);
        });
    }
    setSize(
        renderWidth: number,
        renderHeight: number,
        displayWidth?: number,
        displayHeight?: number
    ): void {
        const canvas = this.gl.canvas;

        const actualDisplayWidth = displayWidth ?? renderWidth;
        const actualDisplayHeight = displayHeight ?? renderHeight;

        if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
            canvas.width = renderWidth;
            canvas.height = renderHeight;
            this.fboManager.setCanvasViewport(renderWidth, renderHeight);
        }

        if ('style' in canvas) {
            canvas.style.width = `${actualDisplayWidth}px`;
            canvas.style.height = `${actualDisplayHeight}px`;
        }
    }

    setDrawingBufferSize(renderWidth: number, renderHeight: number): void {
        const canvas = this.gl.canvas;

        if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
            canvas.width = renderWidth;
            canvas.height = renderHeight;
            this.fboManager.setCanvasViewport(renderWidth, renderHeight);
        }
    }

    private useProgram(program: WebGLProgram): void {
        if (this.currentProgram !== program) {
            this.gl.useProgram(program);
            this.currentProgram = program;
        }
    }

    prepareRender(programId: string, options: RenderOptions = {}): void {
        const { clear = true, clearColor = [0, 0, 0, 1] } = options;
        const gl = this.gl;
        const resources = this.resources.get(programId);

        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }

        if (this.textureBindings.has(programId)) {
            throw new Error(
                `WebGLManager.prepareRender: program "${programId}" has source-texture bindings, but prepareRender `
                + 'never binds or uploads them, so every sampler would read the 1x1 placeholder and the shader would '
                + 'sample transparent black for the life of the program. Source textures are only wired into '
                + 'fastRender today. Render this program through fastRender.'
            );
        }

        this.useProgram(resources.program);

        if (clear) {
            gl.clearColor(...clearColor);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    fastRender(programId: string, time: number, clear = true, width?: number, height?: number): void {
        const gl = this.gl;

        const resources = this.resources.get(programId);
        if (!resources) {
            throw new Error(`Program with id ${programId} not found`);
        }
        this.useProgram(resources.program);

        if (clear) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        this.updateUniforms(programId, time, width, height);
        this.updateTextures(programId);
    }

    readPixels(width: number, height: number): Uint8ClampedArray {
        const gl = this.gl;

        if (gl.isContextLost()) {
            throw new Error('WebGLManager.readPixels: context is lost');
        }

        const pixels = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
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
        if (!location) {
            return;
        }

        this.useProgram(resources.program);

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

        const bufferData = resources.buffers[attributeName] as BufferData | undefined;
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

    drawArraysInstanced(mode: number, first: number, count: number, instanceCount: number): void {
        const gl = this.gl;
        const instancedExt = this.getExtension('ANGLE_instanced_arrays');

        if (instancedExt?.drawArraysInstancedANGLE) {
            instancedExt.drawArraysInstancedANGLE(mode, first, count, instanceCount);
        } else if (gl.drawArraysInstanced) {
            gl.drawArraysInstanced(mode, first, count, instanceCount);
        } else {
            throw new Error('Instanced rendering requires ANGLE_instanced_arrays');
        }
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

        if (this.currentProgram === resources.program) {
            this.currentProgram = null;
        }

        gl.deleteProgram(resources.program);
        this.resources.delete(programId);
        this.uniformUpdateFns.delete(programId);

        const released = this.textureBindings.get(programId) ?? [];
        this.textureBindings.delete(programId);
        this.releaseSourceTextures(released);
    }

    private releaseSourceTextures(released: TextureBindingSpec[]): void {
        for (const { source } of released) {
            if (!this.isSourceBound(source.id)) {
                this.textureManager.destroy(source.id);
            }
        }
    }

    private isSourceBound(sourceId: string): boolean {
        for (const bindings of this.textureBindings.values()) {
            if (bindings.some(binding => binding.source.id === sourceId)) {
                return true;
            }
        }
        return false;
    }

    destroyAll(): void {
        for (const id of Array.from(this.resources.keys())) {
            this.destroy(id);
        }

        this.compileCache.forEach(shader => {
            this.gl.deleteShader(shader);
        });
        this.compileCache.clear();
        this.currentProgram = null;
        this.textureBindings.clear();
        this.textureManager.destroyAll();
        this.fboManager.destroyAll();
    }

    loseContext(): void {
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }

    get context(): WebGLRenderingContext {
        return this.gl;
    }

    get fbo(): FBOManager {
        return this.fboManager;
    }

    get textures(): TextureManager {
        return this.textureManager;
    }
}
