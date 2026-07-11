import { describe, expect, it } from 'vitest';

import {
    createScalarUpdater,
    createVectorUpdater,
    writeFloatBuffer
} from '@/core/lib/uniformDirtyCheck';

describe('writeFloatBuffer', () => {
    it('writes changed elements and reports the change', () => {
        const buffer = new Float32Array([0, 0, 0]);
        const changed = writeFloatBuffer(buffer, [1, 2, 3]);

        expect(changed).toBe(true);
        expect(Array.from(buffer)).toEqual([1, 2, 3]);
    });

    it('reports no change when every element matches', () => {
        const buffer = new Float32Array([1, 2, 3]);
        const changed = writeFloatBuffer(buffer, [1, 2, 3]);

        expect(changed).toBe(false);
        expect(Array.from(buffer)).toEqual([1, 2, 3]);
    });

    it('reports a change when a single element differs', () => {
        const buffer = new Float32Array([1, 2, 3]);
        const changed = writeFloatBuffer(buffer, [1, 2, 4]);

        expect(changed).toBe(true);
        expect(Array.from(buffer)).toEqual([1, 2, 4]);
    });
});

describe('createScalarUpdater', () => {
    it('uploads on the first evaluation', () => {
        const uploaded: number[] = [];
        const update = createScalarUpdater(() => 5, v => uploaded.push(v));

        update();

        expect(uploaded).toEqual([5]);
    });

    it('does not re-upload an unchanged value', () => {
        let source = 5;
        const uploaded: number[] = [];
        const update = createScalarUpdater(() => source, v => uploaded.push(v));

        update();
        update();
        update();

        expect(uploaded).toEqual([5]);

        source = 9;
        update();
        update();

        expect(uploaded).toEqual([5, 9]);
    });
});

describe('createVectorUpdater', () => {
    it('uploads once even when the initial value equals the zeroed buffer', () => {
        let uploads = 0;
        const update = createVectorUpdater(2, () => [0, 0], () => { uploads++ });

        update();
        update();

        expect(uploads).toBe(1);
    });

    it('re-uploads only when an element changes', () => {
        let source: number[] = [1, 2, 3];
        const uploads: number[][] = [];
        const update = createVectorUpdater(3, () => source, buffer => uploads.push(Array.from(buffer)));

        update();
        update();
        expect(uploads).toEqual([[1, 2, 3]]);

        source = [1, 2, 4];
        update();
        expect(uploads).toEqual([[1, 2, 3], [1, 2, 4]]);

        update();
        expect(uploads).toEqual([[1, 2, 3], [1, 2, 4]]);
    });

    it('evaluates function-valued sources every frame', () => {
        let t = 0;
        const uploads: number[][] = [];
        const update = createVectorUpdater(2, () => [t, t], buffer => uploads.push(Array.from(buffer)));

        t = 1;
        update();
        t = 2;
        update();

        expect(uploads).toEqual([[1, 1], [2, 2]]);
    });

    it('detects in-place mutation of a reused source object', () => {
        const source = new Float32Array([0, 0]);
        const uploads: number[][] = [];
        const update = createVectorUpdater(2, () => source, buffer => uploads.push(Array.from(buffer)));

        update();
        source[0] = 1;
        update();
        source[1] = 2;
        update();

        expect(uploads).toEqual([[0, 0], [1, 0], [1, 2]]);
    });

    it('does not re-upload when a reused source object is left unchanged', () => {
        const source = new Float32Array([3, 4]);
        let uploads = 0;
        const update = createVectorUpdater(2, () => source, () => { uploads++ });

        update();
        update();
        update();

        expect(uploads).toBe(1);
    });

    it('treats NaN as always-changed and keeps uploading', () => {
        const uploads: number[][] = [];
        const update = createVectorUpdater(1, () => [NaN], buffer => uploads.push(Array.from(buffer)));

        update();
        update();

        expect(uploads).toHaveLength(2);
        expect(uploads.every(([v]) => Number.isNaN(v))).toBe(true);
    });
});

describe('createScalarUpdater NaN', () => {
    it('re-uploads every frame while the value is NaN', () => {
        const uploaded: number[] = [];
        const update = createScalarUpdater(() => NaN, v => uploaded.push(v));

        update();
        update();

        expect(uploaded).toHaveLength(2);
        expect(uploaded.every(Number.isNaN)).toBe(true);
    });
});
