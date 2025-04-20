// ===================================================
// Core WebGL Types
// ===================================================

export type UniformType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat2' | 'mat3' | 'mat4' | 'int' | 'sampler2D';

export interface UniformTypeMap {
  'float': number;
  'vec2': Float32Array;
  'vec3': Float32Array;
  'vec4': Float32Array;
  'int': number;
  'mat2': Float32Array;
  'mat3': Float32Array;
  'mat4': Float32Array;
  'sampler2D': number;
}

export interface UniformTypeToValueMap {
  'int': number;
  'float': number;
  'sampler2D': number;
  'vec2': Float32Array | [number, number];
  'vec3': Float32Array | [number, number, number];
  'vec4': Float32Array | [number, number, number, number];
  'mat2': Float32Array | [
    number, number, 
    number, number
  ];
  'mat3': Float32Array | [
    number, number, number,
    number, number, number,
    number, number, number
  ];
  'mat4': Float32Array | [
    number, number, number, number, 
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
    ];
}

// ===================================================
// Uniform Updaters
// ===================================================

export type UniformUpdateFn<T extends UniformType> = 
  (time: number, width?: number, height?: number) => UniformTypeMap[T];

export type UniformValue<T extends UniformType> = 
  UniformTypeMap[T] | UniformUpdateFn<T>;

export interface UniformUpdaterDef<T extends UniformType> {
  name: string;
  type: T;
  updateFn: UniformUpdateFn<T>;
}

// ===================================================
// Shader Program Configuration
// ===================================================

export interface ShaderProgramConfig {
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformConfig[];
  attributes?: AttributeConfig[];
}

export interface UniformConfig {
  name: string;
  type: UniformType;
}

export interface AttributeConfig {
  name: string;
  size: number;
  type: 'FLOAT' | 'BYTE' | 'SHORT' | 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT';
  normalized: boolean;
  stride: number;
  offset: number;
  instanced?: boolean;
}

export interface RenderOptions {
  clear?: boolean;
  clearColor?: [number, number, number, number];
}

// ===================================================
// WebGL Resources and State
// ===================================================

export type ShaderUniformLocations = Record<string, WebGLUniformLocation | null>;

export type ShaderAttributeLocations = Record<string, number>;

export interface BufferData {
  buffer: WebGLBuffer;
  data: Float32Array | Uint8Array | Uint16Array | Int8Array | Int16Array;
}

export interface ShaderResources {
  program: WebGLProgram;
  uniforms: ShaderUniformLocations;
  attributes: ShaderAttributeLocations;
  buffers: Record<string, BufferData>;
}

export type ShaderRenderCallback = (
    time: number,
    resources: ShaderResources, 
    gl: WebGLRenderingContext
 ) => void;

// ===================================================
// Framebuffer and Texture Types
// ===================================================

export interface FramebufferResources {
  framebuffer: WebGLFramebuffer;
  textures: WebGLTexture[];
  currentTextureIndex: number;
  width: number;
  height: number;
}

export interface TextureOptions {
  width: number;
  height: number;
  internalFormat?: number;
  format?: number;
  type?: number;
  minFilter?: number;
  magFilter?: number;
  wrapS?: number;
  wrapT?: number;
  generateMipmap?: boolean;
}

export interface FramebufferOptions {
  width: number;
  height: number;
  textureCount?: number;
  textureOptions?: Partial<TextureOptions>;
}

// ===================================================
// Render Pass System
// ===================================================

export interface RenderPass {
  programId: string;
  inputTextures: { 
    id: string;
    textureUnit: number;
    bindingType: 'read' | 'write' | 'readwrite'
  }[];
  outputFramebuffer?: string | null;
  uniforms?: Record<string, { 
    type: UniformType; 
    value: UniformTypeToValueMap[UniformType] | ((time: number, width: number, height: number) => UniformTypeToValueMap[UniformType]);
  }>;
  renderOptions?: RenderOptions;
}

export interface PingPongState {
  readIndex: number;
  writeIndex: number;
  swap: () => void;
}

// ===================================================
// WebGL Extension Types
// ===================================================

export interface WebGLExtensionTypes {
  'OES_texture_float': OES_texture_float;
  'OES_texture_float_linear': OES_texture_float_linear;
  'OES_vertex_array_object': OES_vertex_array_object;
  'ANGLE_instanced_arrays': ANGLE_instanced_arrays;
  [key: string]: unknown;
}

export type WebGLExtensionName = Extract<keyof WebGLExtensionTypes, string>;

// ===================================================
// React Component Types
// ===================================================

export interface UniformParam<T extends UniformType = UniformType> {
  value: UniformTypeMap[T] | ((time?: number, width?: number, height?: number) => UniformTypeMap[T]);
  type: T;
}

export type UniformParamMap = {
  [K in UniformType]: UniformParam<K>;
};
