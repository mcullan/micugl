import { describe, expect, it } from 'vitest';

import {
    isWorkerBuiltinUniformName,
    MAIN_TO_WORKER_MESSAGE_TYPES,
    normalizeCloneSafeUniformValue,
    uniformValuesEqual,
    WORKER_BUILTIN_UNIFORM_NAMES,
    WORKER_TO_MAIN_MESSAGE_TYPES
} from '@/worker/protocol';

describe('WORKER_BUILTIN_UNIFORM_NAMES / isWorkerBuiltinUniformName', () => {
    it('recognizes u_time and u_resolution and nothing else', () => {
        expect(WORKER_BUILTIN_UNIFORM_NAMES).toEqual(['u_time', 'u_resolution']);
        expect(isWorkerBuiltinUniformName('u_time')).toBe(true);
        expect(isWorkerBuiltinUniformName('u_resolution')).toBe(true);
        expect(isWorkerBuiltinUniformName('u_intensity')).toBe(false);
        expect(isWorkerBuiltinUniformName('u_mouse')).toBe(false);
    });
});

describe('message type tag constants', () => {
    it('lists every MainToWorker discriminant exactly once', () => {
        expect(MAIN_TO_WORKER_MESSAGE_TYPES).toEqual([
            'init',
            'setUniformValues',
            'setPasses',
            'resize',
            'setActive',
            'invalidate',
            'setFrameloop',
            'setSpeed',
            'setMotionGate',
            'renderFrame',
            'dispose'
        ]);
        expect(new Set(MAIN_TO_WORKER_MESSAGE_TYPES).size).toBe(MAIN_TO_WORKER_MESSAGE_TYPES.length);
    });

    it('lists every WorkerToMain discriminant exactly once', () => {
        expect(WORKER_TO_MAIN_MESSAGE_TYPES).toEqual(['ready', 'contextlost', 'contextrestored', 'error']);
        expect(new Set(WORKER_TO_MAIN_MESSAGE_TYPES).size).toBe(WORKER_TO_MAIN_MESSAGE_TYPES.length);
    });
});

describe('normalizeCloneSafeUniformValue', () => {
    it('passes plain numbers through unchanged', () => {
        expect(normalizeCloneSafeUniformValue(1.5)).toBe(1.5);
        expect(normalizeCloneSafeUniformValue(0)).toBe(0);
    });

    it('copies plain number arrays instead of aliasing the caller array', () => {
        const source = [1, 2, 3];
        const normalized = normalizeCloneSafeUniformValue(source);

        expect(normalized).toEqual([1, 2, 3]);
        expect(normalized).not.toBe(source);

        source[0] = 99;
        expect(normalized).toEqual([1, 2, 3]);
        expect(normalizeCloneSafeUniformValue([])).toEqual([]);
    });

    it('rejects arrays containing non-number entries', () => {
        expect(normalizeCloneSafeUniformValue([1, '2', 3])).toBeNull();
        expect(normalizeCloneSafeUniformValue([1, null, 3])).toBeNull();
        expect(normalizeCloneSafeUniformValue([[1, 2], [3, 4]])).toBeNull();
        expect(normalizeCloneSafeUniformValue([true, false])).toBeNull();
    });

    it('rejects sparse arrays whose holes would clone as undefined', () => {
        const sparse: number[] = [1, 2, 3];
        Reflect.deleteProperty(sparse, 1);

        expect(normalizeCloneSafeUniformValue(sparse)).toBeNull();
    });

    it('rejects bigint typed arrays that cannot become uniform numbers', () => {
        expect(normalizeCloneSafeUniformValue(new BigInt64Array([1n, 2n]))).toBeNull();
    });

    it('accepts non-finite numbers, which are clone-safe', () => {
        expect(normalizeCloneSafeUniformValue(Number.NaN)).toBeNaN();
        expect(normalizeCloneSafeUniformValue([Number.POSITIVE_INFINITY])).toEqual([Number.POSITIVE_INFINITY]);
    });

    it('normalizes typed arrays into plain arrays', () => {
        expect(normalizeCloneSafeUniformValue(new Float32Array([1, 2, 3]))).toEqual([1, 2, 3]);
        expect(normalizeCloneSafeUniformValue(new Uint8Array([9, 8]))).toEqual([9, 8]);
    });

    it('rejects array-like objects that are not arrays or typed arrays', () => {
        expect(normalizeCloneSafeUniformValue({ length: 2, 0: 1, 1: 2 })).toBeNull();
        expect(normalizeCloneSafeUniformValue(new Proxy({ x: 1 }, {}))).toBeNull();
    });

    it('rejects DataView (not a numeric typed array)', () => {
        expect(normalizeCloneSafeUniformValue(new DataView(new ArrayBuffer(4)))).toBeNull();
    });

    it('rejects functions', () => {
        expect(normalizeCloneSafeUniformValue(() => 1)).toBeNull();
    });

    it('rejects other non-clone-safe values', () => {
        expect(normalizeCloneSafeUniformValue(undefined)).toBeNull();
        expect(normalizeCloneSafeUniformValue({ x: 1 })).toBeNull();
        expect(normalizeCloneSafeUniformValue('nope')).toBeNull();
        expect(normalizeCloneSafeUniformValue(Symbol('s'))).toBeNull();
    });
});

describe('uniformValuesEqual', () => {
    it('treats an absent previous value as always different', () => {
        expect(uniformValuesEqual(undefined, 1)).toBe(false);
        expect(uniformValuesEqual(undefined, [1, 2])).toBe(false);
    });

    it('compares scalars by value', () => {
        expect(uniformValuesEqual(1, 1)).toBe(true);
        expect(uniformValuesEqual(1, 2)).toBe(false);
    });

    it('treats a scalar/vector type mismatch as different', () => {
        expect(uniformValuesEqual([1], 1)).toBe(false);
        expect(uniformValuesEqual(1, [1])).toBe(false);
    });

    it('compares vectors element-wise', () => {
        expect(uniformValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(uniformValuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    it('treats different-length vectors as different', () => {
        expect(uniformValuesEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('treats an unchanged NaN as equal so it is not re-posted forever', () => {
        expect(uniformValuesEqual(Number.NaN, Number.NaN)).toBe(true);
        expect(uniformValuesEqual([1, Number.NaN], [1, Number.NaN])).toBe(true);
        expect(uniformValuesEqual([1, Number.NaN], [1, 2])).toBe(false);
        expect(uniformValuesEqual([1, 2], [1, Number.NaN])).toBe(false);
    });
});
