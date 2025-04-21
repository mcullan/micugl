import { AttributeConfig, RenderOptions, ShaderProgramConfig, ShaderResources, UniformType, UniformUpdateFn, WebGLExtensionName, WebGLExtensionTypes, FBOManager } from '..';
import { UniformTypeMap } from '../../types';
declare global {
    interface WebGLRenderingContext {
        vertexAttribDivisor: ((index: number, divisor: number) => void) | undefined;
    }
}
export declare class WebGLManager {
    private gl;
    private fboManager;
    resources: Map<string, ShaderResources>;
    private compileCache;
    private uniformUpdateFns;
    private extensions;
    constructor(canvas: HTMLCanvasElement, options?: WebGLContextAttributes);
    getExtension<K extends WebGLExtensionName>(name: K): WebGLExtensionTypes[K] | null;
    createProgram(id: string, config: ShaderProgramConfig): ShaderResources;
    private getOrCompileShader;
    private compileShader;
    createBuffer(programId: string, attributeName: string, data: Float32Array | Uint8Array | Uint16Array): WebGLBuffer;
    updateBuffer(programId: string, attributeName: string, data: Float32Array | Uint8Array | Uint16Array): void;
    registerUniformUpdater<T extends UniformType>(programId: string, uniformName: string, type: T, updateFn: UniformUpdateFn<T>): void;
    updateUniforms(programId: string, time: number): void;
    setSize(width: number, height: number, useDevicePixelRatio?: boolean): void;
    prepareRender(programId: string, options?: RenderOptions): void;
    fastRender(programId: string, time: number, clear?: boolean): void;
    setUniform<T extends UniformType>(programId: string, uniformName: string, value: UniformTypeMap[T], type: T): void;
    setAttributeOnce(programId: string, attributeName: string, config: AttributeConfig): void;
    drawArrays(mode: number, first: number, count: number): void;
    drawElements(mode: number, count: number, type: number, offset: number): void;
    destroy(programId: string): void;
    destroyAll(): void;
    get context(): WebGLRenderingContext;
    get fbo(): FBOManager;
}
