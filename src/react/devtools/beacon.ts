import type { WebGLManager } from '@/core';
import type { TextureCapabilities } from '@/core/lib/textureCapabilities';
import type { Frameloop } from '@/types';

export interface EngineDebugState {
    kind: 'shader' | 'pingpong';
    id: string;
    canvas: { renderWidth: number; renderHeight: number; displayWidth: number; displayHeight: number };
    programIds: string[];
    framebufferIds: string[];
    capabilities: TextureCapabilities;
    floatFilterDowngraded: boolean;
    frameloop?: Frameloop;
    paused?: boolean;
    speed?: number;
}

export interface EngineHandle {
    id: string;
    kind: 'shader' | 'pingpong';
    getManager: () => WebGLManager | null;
    getState: () => EngineDebugState;
    invalidate?: () => void;
    setFrameloop?: (mode: Frameloop) => void;
    setFrame?: (frame: number) => void;
    getFrame?: () => number;
}

export interface DevtoolsSink {
    onMount: (handle: EngineHandle) => void;
    onUnmount: (id: string) => void;
}

let sink: DevtoolsSink | null = null;
const engines = new Map<string, EngineHandle>();

export function setDevtoolsSink(next: DevtoolsSink | null): void {
    sink = next;
    if (next) {
        for (const handle of engines.values()) {
            next.onMount(handle);
        }
    }
}

export function emitEngineMount(handle: EngineHandle): void {
    engines.set(handle.id, handle);
    sink?.onMount(handle);
}

export function emitEngineUnmount(id: string): void {
    engines.delete(id);
    sink?.onUnmount(id);
}

export function listEngines(): EngineHandle[] {
    return [...engines.values()];
}
