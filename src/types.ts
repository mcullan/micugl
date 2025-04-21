// ===================================================
// WebGL Data
// ===================================================

export interface BufferData {
  buffer: WebGLBuffer;
  data: 
    Float32Array 
    | Uint8Array 
    | Uint16Array 
    | Int8Array 
    | Int16Array;
}

export type UniformType = 
  | 'float' 
  | 'vec2' 
  | 'vec3' 
  | 'vec4' 
  | 'mat2' 
  | 'mat3' 
  | 'mat4' 
  | 'int' 
  | 'sampler2D';

export type AttributeType = 
  'FLOAT'
  | 'BYTE'
  | 'SHORT'
  | 'UNSIGNED_BYTE'
  | 'UNSIGNED_SHORT';

// ===================================================
// Core WebGL
// ===================================================

export interface RenderOptions {
  clear?: boolean;
  clearColor?: Vec4;
}

export type ShaderUniformLocations = Record<string, WebGLUniformLocation | null>;
export type ShaderAttributeLocations = Record<string, number>;

export interface UniformConfig {
  name: string;
  type: UniformType;
}

export interface AttributeConfig {
  name: string;
  size: number;
  type: AttributeType;
  normalized: boolean;
  stride: number;
  offset: number;
  instanced?: boolean;
}

export interface ShaderResources {
  program: WebGLProgram;
  uniforms: ShaderUniformLocations;
  attributes: ShaderAttributeLocations;
  buffers: Record<string, BufferData>;
}

export interface ShaderProgramConfig {
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformConfig[];
  attributes?: AttributeConfig[];
}

export type ShaderRenderCallback = (
  time: number,
  resources: ShaderResources, 
  gl: WebGLRenderingContext
) => void;

export interface WebGLExtensionTypes {
  'OES_texture_float': OES_texture_float;
  'OES_texture_float_linear': OES_texture_float_linear;
  'OES_vertex_array_object': OES_vertex_array_object;
  'ANGLE_instanced_arrays': ANGLE_instanced_arrays;
  [key: string]: unknown;
}

export type WebGLExtensionName = Extract<keyof WebGLExtensionTypes, string>;

// ===================================================
// Textures and Framebuffers
// ===================================================

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

export interface FramebufferResources {
  framebuffer: WebGLFramebuffer;
  textures: WebGLTexture[];
  currentTextureIndex: number;
  width: number;
  height: number;
}

export interface FramebufferOptions {
  width: number;
  height: number;
  textureCount?: number;
  textureOptions?: Partial<TextureOptions>;
}


// ===================================================
// Render Pass
// ===================================================

export interface TextureBinding {
  id: string;
  textureUnit: number;
  bindingType: 'read' | 'write' | 'readwrite';
}

export type RenderPassUniformUpdateFn = (
  time: number,
  width: number,
  height: number
) => UniformTypeMap[UniformType];

export type RenderPassUniformValue = 
  UniformTypeMap[UniformType] 
  | RenderPassUniformUpdateFn;

export interface RenderPass {
  programId: string;
  inputTextures: TextureBinding[];
  outputFramebuffer?: string | null;
  uniforms?: Record<string, { 
    type: UniformType; 
    value: RenderPassUniformValue;
  }>;
  renderOptions?: RenderOptions;
}

export interface PingPongState {
  readIndex: number;
  writeIndex: number;
  swap: () => void;
}

// ===================================================
// Uniform Updaters
// ===================================================

export interface UniformTypeMap {
  'float': number;
  'int': number;
  'sampler2D': number;
  'vec2': Float32Array2;
  'vec3': Float32Array3;
  'vec4': Float32Array4;
  'mat2': Float32Array4;
  'mat3': Float32Array9;
  'mat4': Float32Array16;
}

export type UniformUpdateFn<T extends UniformType> = 
  (
    time?: number,
    width?: number,
    height?: number
  ) => UniformTypeMap[T];

export type UniformValue<T extends UniformType> = 
  UniformTypeMap[T] 
  | UniformUpdateFn<T>;

export interface UniformUpdaterDef<T extends UniformType> {
  name: string;
  type: T;
  updateFn: UniformUpdateFn<T>;
}

export interface UniformParam<T extends UniformType = UniformType> {
  value: UniformValue<T>;
  type: T;
}

export type UniformParamMap = { [K in UniformType]: UniformParam<K> };

// ===================================================
// JS -> Vector and Matrix
// ===================================================

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export type Mat2 = [
  number, number,
  number, number
];
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export type TypedFloat32Array<N extends number> = Float32Array & { length: N };

export type Float32Array2 = TypedFloat32Array<2>;
export type Float32Array3 = TypedFloat32Array<3>;
export type Float32Array4 = TypedFloat32Array<4>;
export type Float32Array9 = TypedFloat32Array<9>;
export type Float32Array16 = TypedFloat32Array<16>;
