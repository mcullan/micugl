import { describe, expect, it } from 'vitest';

import { combineFrameInvalidation, createFrameInvalidation } from '@/core/lib/frameInvalidation';

describe('createFrameInvalidation', () => {
    it('fans out request() to every connected listener', () => {
        const invalidation = createFrameInvalidation();
        const calls: string[] = [];
        invalidation.connect(() => { calls.push('a') });
        invalidation.connect(() => { calls.push('b') });

        invalidation.request();

        expect(calls).toEqual(['a', 'b']);
    });

    it('dedupes the same listener connected twice', () => {
        const invalidation = createFrameInvalidation();
        let count = 0;
        const listener = () => { count += 1 };

        invalidation.connect(listener);
        invalidation.connect(listener);
        invalidation.request();

        expect(count).toBe(1);
    });

    it('the disposer removes exactly that listener', () => {
        const invalidation = createFrameInvalidation();
        const calls: string[] = [];
        invalidation.connect(() => { calls.push('a') });
        const disposeB = invalidation.connect(() => { calls.push('b') });

        disposeB();
        invalidation.request();

        expect(calls).toEqual(['a']);
    });

    it('request() before any connect() is a harmless no-op', () => {
        const invalidation = createFrameInvalidation();
        expect(() => { invalidation.request() }).not.toThrow();
    });
});

describe('combineFrameInvalidation', () => {
    it('connect() wires the same listener into every source', () => {
        const sourceA = createFrameInvalidation();
        const sourceB = createFrameInvalidation();
        const combined = combineFrameInvalidation([sourceA, sourceB]);

        let count = 0;
        combined.connect(() => { count += 1 });

        sourceA.request();
        sourceB.request();

        expect(count).toBe(2);
    });

    it('request() forwards to every source', () => {
        const sourceA = createFrameInvalidation();
        const sourceB = createFrameInvalidation();
        const combined = combineFrameInvalidation([sourceA, sourceB]);

        const calls: string[] = [];
        sourceA.connect(() => { calls.push('a') });
        sourceB.connect(() => { calls.push('b') });

        combined.request();

        expect(calls).toEqual(['a', 'b']);
    });

    it('the disposer from connect() disconnects from every source', () => {
        const sourceA = createFrameInvalidation();
        const sourceB = createFrameInvalidation();
        const combined = combineFrameInvalidation([sourceA, sourceB]);

        let count = 0;
        const dispose = combined.connect(() => { count += 1 });
        dispose();

        sourceA.request();
        sourceB.request();

        expect(count).toBe(0);
    });
});
