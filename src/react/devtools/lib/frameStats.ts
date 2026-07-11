export interface FrameStats {
    count: number;
    mean: number;
    p50: number;
    p95: number;
}

const percentile = (sorted: readonly number[], p: number): number => {
    if (sorted.length === 0) {
        return 0;
    }
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted.find((_, valueIndex) => valueIndex === index) ?? 0;
};

export const computeFrameStats = (deltas: readonly number[]): FrameStats => {
    const count = deltas.length;
    if (count === 0) {
        return { count: 0, mean: 0, p50: 0, p95: 0 };
    }
    let sum = 0;
    for (const delta of deltas) {
        sum += delta;
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
        count,
        mean: sum / count,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95)
    };
};

export const fpsFromMean = (meanMs: number): number => {
    if (meanMs <= 0) {
        return 0;
    }
    return 1000 / meanMs;
};

export const pushCapped = (buffer: number[], value: number, cap: number): void => {
    buffer.push(value);
    while (buffer.length > cap) {
        buffer.shift();
    }
};
