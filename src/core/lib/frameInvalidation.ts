export interface FrameInvalidation {
    connect(invalidate: () => void): () => void;
    request(): void;
}

export function createFrameInvalidation(): FrameInvalidation {
    const listeners = new Set<() => void>();

    return {
        connect(invalidate) {
            listeners.add(invalidate);
            return () => { listeners.delete(invalidate) };
        },
        request() {
            listeners.forEach(listener => { listener() });
        }
    };
}

export function combineFrameInvalidation(sources: FrameInvalidation[]): FrameInvalidation {
    return {
        connect(invalidate) {
            const disposers = sources.map(source => source.connect(invalidate));
            return () => { disposers.forEach(dispose => { dispose() }) };
        },
        request() {
            sources.forEach(source => { source.request() });
        }
    };
}
