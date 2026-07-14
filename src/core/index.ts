export { createTypedFloat32Array,mat2, mat3, mat4, vec2, vec3, vec4 } from './lib/vectorUtils';
export { createShaderConfig } from '@/core/lib/createShaderConfig';
export type { FrameInvalidation, InvalidationKind } from '@/core/lib/frameInvalidation';
export { combineFrameInvalidation, createFrameInvalidation } from '@/core/lib/frameInvalidation';
export {
    GL_CLAMP_TO_EDGE,
    GL_FLOAT,
    GL_HALF_FLOAT_OES,
    GL_LINEAR,
    GL_MIRRORED_REPEAT,
    GL_NEAREST,
    GL_REPEAT,
    GL_RGBA,
    GL_UNSIGNED_BYTE
} from '@/core/lib/glConstants';
export type {
    GraphPlan,
    GraphTopology,
    GraphTopologyNode,
    GraphUniformValue,
    PlannedInput,
    PlannedPass,
    ShaderNode
} from '@/core/lib/graphPlanning';
export { isShaderNode, planGraph, shaderNode, toRenderPasses } from '@/core/lib/graphPlanning';
export { isPowerOfTwo } from '@/core/lib/math';
export type { SourceDimensions, UploadMode } from '@/core/lib/sourceTextureOptions';
export {
    isUploadable,
    resolveSourceTextureOptions,
    sourceDimensions
} from '@/core/lib/sourceTextureOptions';
export { FBOManager } from '@/core/managers/FBOManager';
export { TextureManager } from '@/core/managers/TextureManager';
export { WebGLManager } from '@/core/managers/WebGLManager';
export { Passes } from '@/core/systems/Passes';
export { Postprocessing } from '@/core/systems/Postprocessing';
export type {
    ActiveUniform,
    ActiveUniformTypes,
    AttributeConfig,
    BufferData,
    FramebufferOptions,
    FramebufferResources,
    InstanceAttribute,
    InstancingConfig,
    PingPongState,
    RenderOptions,
    RenderPass,
    ResolvedSourceTextureOptions,
    ResolvedTextureOptions,
    ShaderAttributeLocations,
    ShaderProgramConfig,
    ShaderRenderCallback,
    ShaderResources,
    ShaderUniformLocations,
    SourceTextureOptions,
    TextureBindingSpec,
    TextureOptions,
    TextureSource,
    TextureUploadSource,
    UniformConfig,
    UniformType,
    UniformUpdateFn,
    UniformUploadCall,
    WebGLExtensionName,
    WebGLExtensionTypes
} from '@/types';
