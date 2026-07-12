import type { InstanceAttribute, InstancingConfig } from '@/types';

export interface InstanceBufferManager {
    createBuffer(
        programId: string,
        attributeName: string,
        data: Float32Array | Uint8Array | Uint16Array,
        usage?: 'static' | 'dynamic'
    ): WebGLBuffer;
    updateBuffer(
        programId: string,
        attributeName: string,
        data: Float32Array | Uint8Array | Uint16Array
    ): void;
    updateBufferSub(
        programId: string,
        attributeName: string,
        data: Float32Array | Uint8Array | Uint16Array,
        offset?: number
    ): void;
}

export function resolveInstanceCount(instanceCount: number | (() => number)): number {
    return typeof instanceCount === 'function' ? instanceCount() : instanceCount;
}

export function validateInstanceCount(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Instance count must be a non-negative integer, got ${count}`);
    }
}

export function resolveAttributeData(data: Float32Array | (() => Float32Array)): Float32Array {
    return typeof data === 'function' ? data() : data;
}

export function validateAttributeLength(attributeName: string, length: number, size: number): void {
    if (length % size !== 0) {
        throw new Error(
            `Instance attribute "${attributeName}" data length ${length} is not a multiple of size ${size}`
        );
    }
}

export function deriveAttributeCapacity(
    attributeName: string,
    initialLength: number,
    size: number,
    explicitCapacity: number | undefined
): number {
    validateAttributeLength(attributeName, initialLength, size);
    const initialInstanceCount = initialLength / size;

    if (explicitCapacity === undefined) {
        return initialInstanceCount;
    }

    if (explicitCapacity < initialInstanceCount) {
        throw new Error(
            `Instance attribute "${attributeName}" capacity ${explicitCapacity} is smaller than its initial ` +
            `data (${initialInstanceCount} instances)`
        );
    }

    return explicitCapacity;
}

export function validateUploadLength(
    attributeName: string,
    length: number,
    size: number,
    count: number
): void {
    validateAttributeLength(attributeName, length, size);
    const availableInstances = length / size;

    if (availableInstances < count) {
        throw new Error(
            `Instance attribute "${attributeName}" provides ${availableInstances} instances but ${count} were requested`
        );
    }
}

export function validateCountWithinCapacity(
    attributeName: string,
    count: number,
    capacity: number
): void {
    if (count > capacity) {
        throw new Error(
            `Instance count ${count} exceeds capacity ${capacity} for attribute "${attributeName}"`
        );
    }
}

interface AttributeState {
    name: string;
    attribute: InstanceAttribute;
    usage: 'static' | 'dynamic';
    capacity: number;
    lastUploadedData: Float32Array | null;
}

export class InstanceUploader {
    private readonly manager: InstanceBufferManager;
    private readonly programId: string;
    private readonly config: InstancingConfig;
    private readonly states: AttributeState[] = [];
    private initialized = false;

    constructor(manager: InstanceBufferManager, programId: string, config: InstancingConfig) {
        this.manager = manager;
        this.programId = programId;
        this.config = config;
    }

    initialize(): void {
        for (const [name, attribute] of Object.entries(this.config.attributes)) {
            const usage = attribute.usage ?? 'static';
            const initialData = resolveAttributeData(attribute.data);
            const capacity = deriveAttributeCapacity(name, initialData.length, attribute.size, attribute.capacity);

            const allocation = usage === 'dynamic'
                ? allocateDynamicBuffer(initialData, capacity * attribute.size)
                : initialData;

            this.manager.createBuffer(this.programId, name, allocation, usage);

            this.states.push({
                name,
                attribute,
                usage,
                capacity,
                lastUploadedData: usage === 'static' ? initialData : null
            });
        }

        this.initialized = true;
    }

    upload(): number {
        if (!this.initialized) {
            throw new Error('InstanceUploader.upload called before initialize()');
        }

        const count = resolveInstanceCount(this.config.instanceCount);
        validateInstanceCount(count);

        for (const state of this.states) {
            validateCountWithinCapacity(state.name, count, state.capacity);
        }

        if (count === 0) {
            return 0;
        }

        for (const state of this.states) {
            const data = resolveAttributeData(state.attribute.data);
            validateUploadLength(state.name, data.length, state.attribute.size, count);

            if (state.usage === 'dynamic') {
                this.manager.updateBufferSub(this.programId, state.name, data, 0);
            } else if (data !== state.lastUploadedData) {
                this.manager.updateBuffer(this.programId, state.name, data);
                state.lastUploadedData = data;
            }
        }

        return count;
    }
}

function allocateDynamicBuffer(initialData: Float32Array, allocatedLength: number): Float32Array {
    const allocation = new Float32Array(allocatedLength);
    allocation.set(initialData);
    return allocation;
}
