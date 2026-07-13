import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import type { MotionGate } from '@/react/lib/motionPolicy';
import type {
    FramebufferOptions,
    Frameloop,
    RenderOptions,
    ShaderProgramConfig,
    TextureBinding,
    UniformType
} from '@/types';

export const WORKER_BUILTIN_UNIFORM_NAMES = ['u_time', 'u_resolution'] as const;

export type WorkerBuiltinUniformName = typeof WORKER_BUILTIN_UNIFORM_NAMES[number];

export function isWorkerBuiltinUniformName(name: string): name is WorkerBuiltinUniformName {
    return (WORKER_BUILTIN_UNIFORM_NAMES as readonly string[]).includes(name);
}

export const MAIN_TO_WORKER_MESSAGE_TYPES = [
    'init',
    'setUniformValues',
    'setPasses',
    'resize',
    'setActive',
    'invalidate',
    'setFrameloop',
    'setSpeed',
    'setMotionGate',
    'renderFrame',
    'dispose'
] as const;

export const WORKER_TO_MAIN_MESSAGE_TYPES = [
    'ready',
    'contextlost',
    'contextrestored',
    'error'
] as const;

export type UniformScalar = number;
export type UniformVector = number[];
export type UniformValueMap = Record<string, UniformScalar | UniformVector>;

export type WorkerRenderOptions = Pick<RenderOptions, 'clear'>;

export interface UniformDescriptor {
    name: string;
    type: UniformType;
}

export interface SerializableRenderPassValueUniform {
    kind: 'value';
    type: UniformType;
    value: UniformScalar | UniformVector;
}

export interface SerializableRenderPassBuiltinUniform {
    kind: 'builtin';
    type: UniformType;
}

export type SerializableRenderPassUniform =
    | SerializableRenderPassValueUniform
    | SerializableRenderPassBuiltinUniform;

export interface SerializableRenderPass {
    programId: string;
    inputTextures: TextureBinding[];
    outputFramebuffer?: string | null;
    uniforms?: Record<string, SerializableRenderPassUniform>;
    renderOptions?: RenderOptions;
}

export interface WorkerInitConfig {
    programConfigs: Record<string, ShaderProgramConfig>;
    kind: 'single' | 'pingpong';
    passes?: SerializableRenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    initialValues: Record<string, UniformValueMap>;
    descriptors: Record<string, UniformDescriptor[]>;
    skipDefaultUniforms?: boolean;
    frameloop: Frameloop;
    speed: number;
    active: boolean;
    renderOptions?: WorkerRenderOptions;
    contextAttributes?: WebGLContextAttributes;
}

export interface WorkerCapabilities {
    maxTextureSize: number;
    extensions: string[];
}

export type MainToWorker =
    | { type: 'init'; canvas: OffscreenCanvas; config: WorkerInitConfig }
    | { type: 'setUniformValues'; programId: string; values: UniformValueMap }
    | { type: 'setPasses'; passes: SerializableRenderPass[] }
    | { type: 'resize'; renderWidth: number; renderHeight: number }
    | { type: 'setActive'; active: boolean }
    | { type: 'invalidate'; frames?: number; kind?: InvalidationKind }
    | { type: 'setFrameloop'; mode: Frameloop }
    | { type: 'setSpeed'; speed: number }
    | { type: 'setMotionGate'; gate: MotionGate }
    | { type: 'renderFrame'; time: number }
    | { type: 'dispose' };

export type WorkerToMain =
    | { type: 'ready'; capabilities: WorkerCapabilities }
    | { type: 'contextlost' }
    | { type: 'contextrestored' }
    | { type: 'error'; message: string };

function isNumberArray(entries: unknown[]): entries is number[] {
    return entries.every(entry => typeof entry === 'number');
}

export function normalizeCloneSafeUniformValue(value: unknown): UniformScalar | UniformVector | null {
    if (typeof value === 'number') {
        return value;
    }
    const isNumericTypedArray = ArrayBuffer.isView(value) && !(value instanceof DataView);
    if (Array.isArray(value) || isNumericTypedArray) {
        const entries: unknown[] = Array.from(value as unknown as ArrayLike<unknown>);
        return isNumberArray(entries) ? entries : null;
    }
    return null;
}

export function uniformValuesEqual(
    a: UniformScalar | UniformVector | undefined,
    b: UniformScalar | UniformVector
): boolean {
    if (a === undefined) {
        return false;
    }
    if (typeof b === 'number') {
        return Object.is(a, b);
    }
    if (typeof a === 'number') {
        return false;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < b.length; i++) {
        if (!Object.is(a[i], b[i])) {
            return false;
        }
    }
    return true;
}
