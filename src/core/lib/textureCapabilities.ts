import {
    GL_FLOAT,
    GL_HALF_FLOAT_OES,
    GL_LINEAR,
    GL_NEAREST,
    GL_UNSIGNED_BYTE
} from '@/core/lib/glConstants';

export interface TextureCapabilities {
    floatRenderable: boolean;
    halfFloatRenderable: boolean;
    floatLinearFilterable: boolean;
    halfFloatLinearFilterable: boolean;
    halfFloatType: number;
}

export interface RequestedTextureType {
    type?: number;
    minFilter: number;
    magFilter: number;
}

export interface ResolvedTextureType {
    type: number;
    minFilter: number;
    magFilter: number;
    filterDowngraded: boolean;
}

function requestsFloat(type: number): boolean {
    return type === GL_FLOAT || type === GL_HALF_FLOAT_OES;
}

function downgradeFilter(filter: number, filterable: boolean): number {
    if (!filterable && filter === GL_LINEAR) {
        return GL_NEAREST;
    }
    return filter;
}

export function resolveTextureType(
    requested: RequestedTextureType,
    caps: TextureCapabilities
): ResolvedTextureType {
    const requestedType = requested.type ?? GL_UNSIGNED_BYTE;

    if (!requestsFloat(requestedType)) {
        return {
            type: requestedType,
            minFilter: requested.minFilter,
            magFilter: requested.magFilter,
            filterDowngraded: false
        };
    }

    const preferFloatFirst = requestedType === GL_FLOAT;

    let type: number;
    let filterable: boolean;

    if (preferFloatFirst && caps.floatRenderable) {
        type = GL_FLOAT;
        filterable = caps.floatLinearFilterable;
    } else if (caps.halfFloatRenderable) {
        type = caps.halfFloatType;
        filterable = caps.halfFloatLinearFilterable;
    } else if (caps.floatRenderable) {
        type = GL_FLOAT;
        filterable = caps.floatLinearFilterable;
    } else {
        throw new Error(
            'Float framebuffer textures were requested but this device cannot render to FLOAT or HALF_FLOAT. '
            + 'Refusing to fall back to UNSIGNED_BYTE, which would clamp signed values to [0,1] and silently '
            + 'break ping-pong feedback simulations. Request an UNSIGNED_BYTE texture explicitly if a clamped '
            + 'byte target is acceptable.'
        );
    }

    const minFilter = downgradeFilter(requested.minFilter, filterable);
    const magFilter = downgradeFilter(requested.magFilter, filterable);

    return {
        type,
        minFilter,
        magFilter,
        filterDowngraded: minFilter !== requested.minFilter || magFilter !== requested.magFilter
    };
}
