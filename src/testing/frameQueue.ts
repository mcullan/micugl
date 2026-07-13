export interface FrameQueue {
    schedule: (callback: (now: number) => void) => number;
    cancel: (handle: number) => void;
    pending: () => number;
    tick: (now: number) => void;
}

export function createFrameQueue(): FrameQueue {
    const scheduled = new Map<number, (now: number) => void>();
    let nextHandle = 1;

    return {
        schedule: callback => {
            const handle = nextHandle;
            nextHandle += 1;
            scheduled.set(handle, callback);
            return handle;
        },
        cancel: handle => { scheduled.delete(handle) },
        pending: () => scheduled.size,
        tick: now => {
            const callbacks = Array.from(scheduled.values());
            scheduled.clear();
            callbacks.forEach(callback => { callback(now) });
        }
    };
}
