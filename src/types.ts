import type { FrameInvalidation } from '@/core/lib/frameInvalidation';

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
  allocatedByteLength: number;
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

export type ShaderUniformLocations = Partial<Record<string, WebGLUniformLocation | null>>;
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

export interface InstanceAttribute {
  data: Float32Array | (() => Float32Array);
  size: number;
  usage?: 'static' | 'dynamic';
  normalized?: boolean;
  capacity?: number;
}

export interface InstancingConfig {
  instanceCount: number | (() => number);
  attributes: Record<string, InstanceAttribute>;
}

export type UniformUploadCall =
  'uniform1f'
  | 'uniform1i'
  | 'uniform2fv'
  | 'uniform3fv'
  | 'uniform4fv'
  | 'uniform2iv'
  | 'uniform3iv'
  | 'uniform4iv'
  | 'uniformMatrix2fv'
  | 'uniformMatrix3fv'
  | 'uniformMatrix4fv';

export interface ActiveUniform {
  glslType: string;
  uploadCall: UniformUploadCall;
}

export type ActiveUniformTypes = Partial<Record<string, ActiveUniform>>;

export interface ShaderResources {
  program: WebGLProgram;
  uniforms: ShaderUniformLocations;
  activeUniforms: ActiveUniformTypes;
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

// ===================================================
// Rendering Control
// ===================================================

export type Frameloop = 'always' | 'demand' | 'never';

export type Fit = 'window' | 'element';

export type Dpr = number | [number, number];

export type MotionPolicy = 'static-frame' | 'pause' | 'ignore';

export interface SeedOptions { kind: 'clear'; color?: Vec4 }

export interface RenderToBlobOptions {
  frame?: number;
  width?: number;
  height?: number;
  scale?: number;
  type?: string;
  quality?: number;
  seed?: SeedOptions;
  steps?: number;
  fps?: number;
}

export interface RecordOptions {
  fps?: number;
  mimeType?: string;
  videoBitsPerSecond?: number;
}

export interface Recording {
  stop(): Promise<Blob>;
  cancel(): void;
  readonly stream: MediaStream;
}

export interface SequenceOptions {
  fps: number;
  frames?: number;
  durationSeconds?: number;
  startFrame?: number;
  codec?: string;
  container?: 'webm' | 'mp4' | 'none';
  bitrate?: number;
  seed?: SeedOptions;
  onFrame?: (frame: VideoFrame, index: number) => void;
  signal?: AbortSignal;
}

export interface ShaderHandle {
  invalidate: () => void;
  setFrame: (frame: number) => void;
  getFrame: () => number;
  start: () => void;
  stop: () => void;
  renderToBlob: (options?: RenderToBlobOptions) => Promise<Blob>;
  renderToDataURL: (options?: RenderToBlobOptions) => Promise<string>;
  captureStream: (fps?: number) => MediaStream;
  record: (options?: RecordOptions) => Recording;
  renderSequence: (options: SequenceOptions) => Promise<Blob | null>;
}

export interface PingPongShaderHandle extends ShaderHandle {
  resetSimulation: (seed?: SeedOptions) => void;
}

export type WorkerMode = boolean | 'auto';

export interface RenderControlProps {
  frameloop?: Frameloop;
  speed?: number;
  pauseWhenHidden?: boolean;
  dpr?: Dpr;
  maxPixelCount?: number;
  fit?: Fit;
  width?: number;
  height?: number;
  pixelRatio?: number;
  useDevicePixelRatio?: boolean;
  reducedMotion?: MotionPolicy;
  saveData?: MotionPolicy;
  staticFrame?: number;
  worker?: WorkerMode;
  createWorker?: () => Worker;
}

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
}

export interface ResolvedTextureOptions {
  internalFormat: number;
  format: number;
  type: number;
  minFilter: number;
  magFilter: number;
  wrapS: number;
  wrapT: number;
}

export interface FramebufferResources {
  framebuffer: WebGLFramebuffer;
  textures: WebGLTexture[];
  currentTextureIndex: number;
  width: number;
  height: number;
  textureOptions: ResolvedTextureOptions;
  lastBoundTextureIndex: number;
}

export interface FramebufferOptions {
  width: number;
  height: number;
  textureCount?: number;
  textureOptions?: Partial<TextureOptions>;
}

export interface ResolvedSourceTextureOptions {
  minFilter: number;
  magFilter: number;
  wrapS: number;
  wrapT: number;
  flipY: boolean;
  premultiplyAlpha: boolean;
}

export type SourceTextureOptions = Partial<ResolvedSourceTextureOptions>;

export type TextureUploadSource = TexImageSource;

export interface TextureSource {
  id: string;
  version: number;
  options: ResolvedSourceTextureOptions;
  getFrame: () => TextureUploadSource | null;
  invalidation: FrameInvalidation;
  nonReproducible?: () => boolean;
}

export interface TextureBindingSpec {
  unit: number;
  samplerName: string;
  source: TextureSource;
}

export type TextureStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ImageInput =
  string
  | Blob
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageData;

// ===================================================
// Render Pass
// ===================================================

export interface TextureBinding {
  id: string;
  textureUnit: number;
  bindingType: 'read' | 'write' | 'readwrite';
  samplerName: string;
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

export interface UniformUpdaterDef<T extends UniformType = UniformType> {
  name: string;
  type: T;
  updateFn: UniformUpdateFn<T>;
}

// ===================================================
// Uniform Transitions
// ===================================================

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export type EasingFn = (t: number) => number;

export interface TweenTransitionConfig {
  type?: 'tween';
  duration: number;
  easing?: EasingName | EasingFn;
  delay?: number;
  interpolate?: (from: ArrayLike<number>, to: ArrayLike<number>, t: number, out: Float32Array) => void;
}

export interface SpringTransitionConfig {
  type: 'spring';
  stiffness?: number;
  damping?: number;
  mass?: number;
  restDelta?: number;
  restSpeed?: number;
}

export type UniformTransitionConfig = TweenTransitionConfig | SpringTransitionConfig;

export interface UniformParam<T extends UniformType = UniformType> {
  value: UniformValue<T>;
  type: T;
  transition?: UniformTransitionConfig;
  invalidation?: FrameInvalidation;
  nonReproducible?: () => boolean;
}

export type UniformParamMap = { [K in UniformType]: UniformParam<K> };

export type BandLayout = 'log' | 'linear';

export type AudioStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export type AudioSourceSpec =
  | { type: 'mic' }
  | { type: 'element'; element: HTMLMediaElement }
  | { type: 'node'; node: AudioNode; context: AudioContext };

export interface AudioUniformNames {
  bands?: string;
  level?: string;
}

export interface AudioUniformsOptions {
  bands?: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
  attack?: number;
  release?: number;
  minDecibels?: number;
  maxDecibels?: number;
  bandLayout?: BandLayout;
  names?: AudioUniformNames;
}

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
