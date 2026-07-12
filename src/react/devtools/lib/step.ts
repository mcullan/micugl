import type { UniformType } from '@/types';

const LOG10 = Math.log(10);
const MIN_STEP = 0.001;
const DEFAULT_STEP = 0.01;
const MAX_PAD = 2;

export function getStep(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_STEP;
    }
    let magnitude = Math.abs(Number(String(value).replace('.', '')));
    if (magnitude === 0 || !Number.isFinite(magnitude)) {
        return DEFAULT_STEP;
    }
    while (magnitude !== 0 && magnitude % 10 === 0) {
        magnitude /= 10;
    }
    const significantDigits = Math.floor(Math.log(magnitude) / LOG10) + 1;
    const numberLog = Math.floor(Math.log10(Math.abs(value)));
    return Math.max(Math.pow(10, numberLog - significantDigits), MIN_STEP);
}

export function stepForType(type: UniformType, value: number): number {
    if (type === 'int' || type === 'sampler2D') {
        return 1;
    }
    return getStep(value);
}

export function padFor(step: number): number {
    if (!Number.isFinite(step) || step <= 0) {
        return 0;
    }
    const pad = Math.round(Math.log10(1 / step));
    return Math.min(Math.max(pad, 0), MAX_PAD);
}

export function formatValue(value: number, step: number): string {
    if (!Number.isFinite(value)) {
        return '0';
    }
    return value.toFixed(padFor(step));
}
