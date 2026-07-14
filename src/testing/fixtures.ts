import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { resolveSourceTextureOptions } from '@/core/lib/sourceTextureOptions';
import type { GLStubHandle } from '@/testing/glStub';
import type {
    SourceTextureOptions,
    TextureSource,
    TextureUploadSource
} from '@/types';

export function uploadsOf(stub: GLStubHandle, name: string): unknown[] {
    const location = stub.gl.getUniformLocation({} as WebGLProgram, name);
    if (location === null) {
        return [];
    }
    return stub.uniformCalls.filter(call => call.location === location).map(call => call.value);
}

export const bitmap = (width: number, height: number): TextureUploadSource =>
    ({ width, height }) as unknown as TextureUploadSource;

export const video = (videoWidth: number, videoHeight: number): TextureUploadSource =>
    ({ videoWidth, videoHeight }) as unknown as TextureUploadSource;

export interface SourceHandle {
    source: TextureSource;
    push: (frame: TextureUploadSource) => void;
    withhold: () => void;
    reoffer: () => void;
}

export function createSource(id: string, options?: SourceTextureOptions): SourceHandle {
    let frame: TextureUploadSource | null = null;
    let offered = true;
    let version = 0;

    const source: TextureSource = {
        id,
        get version() { return version },
        options: resolveSourceTextureOptions(options),
        getFrame: () => (offered ? frame : null),
        invalidation: createFrameInvalidation()
    };

    return {
        source,
        push: (next: TextureUploadSource) => {
            frame = next;
            version += 1;
        },
        withhold: () => { offered = false },
        reoffer: () => { offered = true }
    };
}
