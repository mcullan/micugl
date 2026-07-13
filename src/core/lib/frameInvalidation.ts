export type InvalidationKind = 'discrete' | 'continuous';

export interface FrameInvalidation {
    connect(invalidate: (kind: InvalidationKind) => void): () => void;
    request(kind?: InvalidationKind): void;
}

export function createFrameInvalidation(): FrameInvalidation {
    const listeners = new Set<(kind: InvalidationKind) => void>();

    return {
        connect(invalidate) {
            listeners.add(invalidate);
            return () => { listeners.delete(invalidate) };
        },
        request(kind = 'discrete') {
            listeners.forEach(listener => { listener(kind) });
        }
    };
}

export function combineFrameInvalidation(sources: FrameInvalidation[]): FrameInvalidation {
    return {
        connect(invalidate) {
            const disposers = sources.map(source => source.connect(invalidate));
            return () => { disposers.forEach(dispose => { dispose() }) };
        },
        request(kind) {
            sources.forEach(source => { source.request(kind) });
        }
    };
}
