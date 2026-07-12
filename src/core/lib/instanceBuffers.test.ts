import { describe, expect, it } from 'vitest';

import type { InstanceBufferManager } from '@/core/lib/instanceBuffers';
import {
    deriveAttributeCapacity,
    InstanceUploader,
    resolveAttributeData,
    resolveInstanceCount,
    validateAttributeLength,
    validateCountWithinCapacity,
    validateInstanceCount,
    validateUploadLength
} from '@/core/lib/instanceBuffers';
import type { InstancingConfig } from '@/types';

interface RecordedCreateBuffer {
    programId: string;
    attributeName: string;
    data: Float32Array | Uint8Array | Uint16Array;
    usage: 'static' | 'dynamic' | undefined;
}

interface RecordedUpdateBuffer {
    programId: string;
    attributeName: string;
    data: Float32Array | Uint8Array | Uint16Array;
}

interface RecordedUpdateBufferSub {
    programId: string;
    attributeName: string;
    data: Float32Array | Uint8Array | Uint16Array;
    offset: number | undefined;
}

function createRecordingManager(): InstanceBufferManager & {
    createBufferCalls: RecordedCreateBuffer[];
    updateBufferCalls: RecordedUpdateBuffer[];
    updateBufferSubCalls: RecordedUpdateBufferSub[];
    } {
    const createBufferCalls: RecordedCreateBuffer[] = [];
    const updateBufferCalls: RecordedUpdateBuffer[] = [];
    const updateBufferSubCalls: RecordedUpdateBufferSub[] = [];

    return {
        createBufferCalls,
        updateBufferCalls,
        updateBufferSubCalls,
        createBuffer(programId, attributeName, data, usage): WebGLBuffer {
            createBufferCalls.push({ programId, attributeName, data, usage });
            return {};
        },
        updateBuffer(programId, attributeName, data): void {
            updateBufferCalls.push({ programId, attributeName, data });
        },
        updateBufferSub(programId, attributeName, data, offset): void {
            updateBufferSubCalls.push({ programId, attributeName, data, offset });
        }
    };
}

describe('resolveInstanceCount', () => {
    it('returns a plain number as-is', () => {
        expect(resolveInstanceCount(5)).toBe(5);
    });

    it('calls a function to resolve the count', () => {
        expect(resolveInstanceCount(() => 7)).toBe(7);
    });
});

describe('resolveAttributeData', () => {
    it('returns a plain array as-is', () => {
        const data = new Float32Array([1, 2]);
        expect(resolveAttributeData(data)).toBe(data);
    });

    it('calls a function to resolve the array', () => {
        const data = new Float32Array([3, 4]);
        expect(resolveAttributeData(() => data)).toBe(data);
    });
});

describe('validateAttributeLength', () => {
    it('passes when length is a multiple of size', () => {
        expect(() => { validateAttributeLength('foo', 9, 3) }).not.toThrow();
    });

    it('throws naming the attribute when length is not a multiple of size', () => {
        expect(() => { validateAttributeLength('foo', 10, 3) }).toThrow(/foo/);
    });
});

describe('deriveAttributeCapacity', () => {
    it('defaults capacity to the initial instance count', () => {
        expect(deriveAttributeCapacity('foo', 12, 3, undefined)).toBe(4);
    });

    it('accepts an explicit capacity at or above the initial instance count', () => {
        expect(deriveAttributeCapacity('foo', 12, 3, 10)).toBe(10);
    });

    it('throws when explicit capacity is smaller than the initial data', () => {
        expect(() => deriveAttributeCapacity('foo', 12, 3, 2)).toThrow(/foo/);
    });

    it('throws when the initial length is not a multiple of size', () => {
        expect(() => deriveAttributeCapacity('foo', 10, 3, undefined)).toThrow(/foo/);
    });
});

describe('validateUploadLength', () => {
    it('passes when the data covers the requested count', () => {
        expect(() => { validateUploadLength('foo', 12, 3, 4) }).not.toThrow();
    });

    it('throws when length is not a multiple of size', () => {
        expect(() => { validateUploadLength('foo', 10, 3, 2) }).toThrow(/foo/);
    });

    it('throws when the data is shorter than count * size', () => {
        expect(() => { validateUploadLength('foo', 6, 3, 4) }).toThrow(/foo/);
    });
});

describe('validateInstanceCount', () => {
    it('passes for zero and positive integers', () => {
        expect(() => { validateInstanceCount(0) }).not.toThrow();
        expect(() => { validateInstanceCount(5) }).not.toThrow();
    });

    it('throws for a negative count', () => {
        expect(() => { validateInstanceCount(-1) }).toThrow(/non-negative integer/);
    });

    it('throws for a fractional count', () => {
        expect(() => { validateInstanceCount(2.5) }).toThrow(/non-negative integer/);
    });

    it('throws for NaN and Infinity', () => {
        expect(() => { validateInstanceCount(NaN) }).toThrow(/non-negative integer/);
        expect(() => { validateInstanceCount(Infinity) }).toThrow(/non-negative integer/);
    });
});

describe('validateCountWithinCapacity', () => {
    it('passes when count is at or below capacity', () => {
        expect(() => { validateCountWithinCapacity('foo', 10, 10) }).not.toThrow();
    });

    it('throws naming the attribute, count, and capacity on overflow', () => {
        expect(() => { validateCountWithinCapacity('foo', 11, 10) }).toThrow(/foo/);
    });
});

describe('InstanceUploader', () => {
    const staticData = new Float32Array([0, 0, 1, 1, 2, 2]);

    function makeConfig(overrides: Partial<InstancingConfig> = {}): InstancingConfig {
        return {
            instanceCount: 3,
            attributes: {
                offset: { data: staticData, size: 2 }
            },
            ...overrides
        };
    }

    it('creates a buffer per attribute on initialize', () => {
        const manager = createRecordingManager();
        const uploader = new InstanceUploader(manager, 'prog', makeConfig());

        uploader.initialize();

        expect(manager.createBufferCalls).toHaveLength(1);
        expect(manager.createBufferCalls[0]).toMatchObject({
            programId: 'prog',
            attributeName: 'offset',
            usage: 'static'
        });
    });

    it('derives default capacity from the initial data when none is given', () => {
        const manager = createRecordingManager();
        const uploader = new InstanceUploader(manager, 'prog', makeConfig());
        uploader.initialize();

        expect(() => uploader.upload()).not.toThrow();

        const config = makeConfig({ instanceCount: 4 });
        const overflowUploader = new InstanceUploader(manager, 'prog', config);
        overflowUploader.initialize();
        expect(() => overflowUploader.upload()).toThrow(/capacity/);
    });

    it('throws on capacity overflow naming the attribute, count, and capacity', () => {
        const manager = createRecordingManager();
        const config: InstancingConfig = {
            instanceCount: 5,
            attributes: {
                offset: { data: staticData, size: 2, capacity: 3 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        expect(() => uploader.upload()).toThrow(/offset/);
    });

    it('throws when a resolved attribute array length is not a multiple of size', () => {
        const manager = createRecordingManager();
        let current = new Float32Array([1, 2, 3, 4]);
        const config: InstancingConfig = {
            instanceCount: 2,
            attributes: {
                offset: { data: () => current, size: 2, capacity: 10 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        current = new Float32Array([1, 2, 3]);
        expect(() => uploader.upload()).toThrow(/offset/);
    });

    it('throws when a resolved attribute array is shorter than count * size', () => {
        const manager = createRecordingManager();
        const config: InstancingConfig = {
            instanceCount: 5,
            attributes: {
                offset: { data: staticData, size: 2, capacity: 10 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        expect(() => uploader.upload()).toThrow(/offset/);
    });

    it('uploads a static attribute once then skips when the array identity is unchanged', () => {
        const manager = createRecordingManager();
        const uploader = new InstanceUploader(manager, 'prog', makeConfig());
        uploader.initialize();

        uploader.upload();
        uploader.upload();
        uploader.upload();

        expect(manager.updateBufferCalls).toHaveLength(0);
    });

    it('re-uploads a static attribute when the array identity changes', () => {
        const manager = createRecordingManager();
        let current = staticData;
        const config: InstancingConfig = {
            instanceCount: 3,
            attributes: {
                offset: { data: () => current, size: 2 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        uploader.upload();
        expect(manager.updateBufferCalls).toHaveLength(0);

        current = new Float32Array([9, 9, 8, 8, 7, 7]);
        uploader.upload();
        expect(manager.updateBufferCalls).toHaveLength(1);

        uploader.upload();
        expect(manager.updateBufferCalls).toHaveLength(1);
    });

    it('uploads a dynamic attribute on every call regardless of identity', () => {
        const manager = createRecordingManager();
        const data = new Float32Array([1, 1, 2, 2, 3, 3]);
        const config: InstancingConfig = {
            instanceCount: 3,
            attributes: {
                offset: { data, size: 2, usage: 'dynamic' }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        uploader.upload();
        uploader.upload();

        expect(manager.updateBufferSubCalls).toHaveLength(2);
        expect(manager.updateBufferCalls).toHaveLength(0);
    });

    it('allocates a dynamic buffer sized to capacity, not the initial data', () => {
        const manager = createRecordingManager();
        const config: InstancingConfig = {
            instanceCount: 2,
            attributes: {
                offset: { data: new Float32Array([1, 1]), size: 2, usage: 'dynamic', capacity: 10 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        const created = manager.createBufferCalls[0]?.data ?? new Float32Array(0);
        expect(created.length).toBe(20);
    });

    it('returns the resolved instance count', () => {
        const manager = createRecordingManager();
        const uploader = new InstanceUploader(manager, 'prog', makeConfig());
        uploader.initialize();

        expect(uploader.upload()).toBe(3);
    });

    it('returns 0 and uploads nothing when the resolved count is 0', () => {
        const manager = createRecordingManager();
        const config: InstancingConfig = {
            instanceCount: 0,
            attributes: {
                offset: { data: staticData, size: 2 },
                velocity: { data: new Float32Array([1, 1, 2, 2, 3, 3]), size: 2, usage: 'dynamic' }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        expect(uploader.upload()).toBe(0);
        expect(manager.updateBufferCalls).toHaveLength(0);
        expect(manager.updateBufferSubCalls).toHaveLength(0);
    });

    it('resolves instanceCount via a function', () => {
        const manager = createRecordingManager();
        let count = 2;
        const config: InstancingConfig = {
            instanceCount: () => count,
            attributes: {
                offset: { data: staticData, size: 2 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        expect(uploader.upload()).toBe(2);
        count = 3;
        expect(uploader.upload()).toBe(3);
    });

    it('throws and uploads nothing when the resolved count is not a non-negative integer', () => {
        const manager = createRecordingManager();
        let count = 2;
        const config: InstancingConfig = {
            instanceCount: () => count,
            attributes: {
                offset: { data: staticData, size: 2, usage: 'dynamic', capacity: 10 }
            }
        };
        const uploader = new InstanceUploader(manager, 'prog', config);
        uploader.initialize();

        for (const bad of [NaN, -1, 2.5]) {
            count = bad;
            expect(() => uploader.upload()).toThrow(/non-negative integer/);
        }

        expect(manager.updateBufferSubCalls).toHaveLength(0);
    });

    it('throws if upload is called before initialize', () => {
        const manager = createRecordingManager();
        const uploader = new InstanceUploader(manager, 'prog', makeConfig());

        expect(() => uploader.upload()).toThrow(/initialize/);
    });
});
