import { describe, expect, it } from 'vitest';

import {
    diffCounters,
    expectCounterDeltas,
    expectNoNewContexts,
    expectZeroCompiles,
    formatCounterDiff
} from '@/testing/assertions';
import type { GlCountersData } from '@/testing/glCounters';

const zeroCounters = (): GlCountersData => ({
    contextsCreated: 0,
    compileShader: 0,
    linkProgram: 0,
    texImage2D: 0,
    textureBytes: 0,
    framebufferTexture2D: 0,
    checkFramebufferStatus: 0,
    useProgram: 0,
    uniformCalls: 0,
    drawArrays: 0,
    drawElements: 0,
    bufferData: 0,
    bufferBytes: 0
});

describe('diffCounters', () => {
    it('subtracts before from after for every metric', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 4, uniformCalls: 2, compileShader: 1 };

        expect(diffCounters(before, after)).toEqual({
            ...zeroCounters(),
            drawArrays: 4,
            uniformCalls: 2,
            compileShader: 1
        });
    });

    it('produces negative deltas when after is lower than before (e.g. after a reset)', () => {
        const before: GlCountersData = { ...zeroCounters(), drawArrays: 10 };
        const after = zeroCounters();

        expect(diffCounters(before, after).drawArrays).toBe(-10);
    });
});

describe('expectZeroCompiles', () => {
    it('passes when compileShader and linkProgram deltas are zero', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 5 };

        expect(() => { expectZeroCompiles(before, after) }).not.toThrow();
    });

    it('throws with a formatted diff table when compileShader delta is nonzero', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), compileShader: 1 };

        expect(() => { expectZeroCompiles(before, after) }).toThrow(/compileShader delta=1/);
        expect(() => { expectZeroCompiles(before, after) }).toThrow(/metric\s+before\s+after\s+delta/);
    });

    it('throws when linkProgram delta is nonzero', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), linkProgram: 2 };

        expect(() => { expectZeroCompiles(before, after) }).toThrow(/linkProgram delta=2/);
    });
});

describe('expectCounterDeltas', () => {
    it('passes when every expected metric matches its actual delta', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 4, uniformCalls: 2, texImage2D: 0 };

        expect(() => {
            expectCounterDeltas(before, after, { drawArrays: 4, uniformCalls: 2, texImage2D: 0 });
        }).not.toThrow();
    });

    it('ignores metrics not present in the expected partial', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 4, compileShader: 99 };

        expect(() => {
            expectCounterDeltas(before, after, { drawArrays: 4 });
        }).not.toThrow();
    });

    it('lists every mismatched metric in the thrown error', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 3, uniformCalls: 1 };

        expect(() => {
            expectCounterDeltas(before, after, { drawArrays: 4, uniformCalls: 2 });
        }).toThrow(/drawArrays: expected 4, got 3.*uniformCalls: expected 2, got 1/);
    });

    it('does not flag a metric whose delta matches the expectation', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 4, uniformCalls: 1 };

        expect(() => {
            expectCounterDeltas(before, after, { drawArrays: 4, uniformCalls: 2 });
        }).toThrow(/uniformCalls: expected 2, got 1/);
    });
});

describe('expectNoNewContexts', () => {
    it('passes when contextsCreated delta is zero', () => {
        const before = zeroCounters();
        const after = zeroCounters();

        expect(() => { expectNoNewContexts(before, after) }).not.toThrow();
    });

    it('throws when contextsCreated delta is nonzero', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), contextsCreated: 1 };

        expect(() => { expectNoNewContexts(before, after) }).toThrow(/contextsCreated delta=1/);
    });
});

describe('formatCounterDiff', () => {
    it('renders an aligned header row and one row per metric', () => {
        const before = zeroCounters();
        const after: GlCountersData = { ...zeroCounters(), drawArrays: 4 };

        const table = formatCounterDiff(before, after);
        const lines = table.split('\n');

        expect(lines[0]).toMatch(/^metric\s+before\s+after\s+delta$/);
        expect(lines).toHaveLength(1 + Object.keys(zeroCounters()).length);
        expect(lines.some(line => /^drawArrays\s+0\s+4\s+4$/.test(line))).toBe(true);
    });

    it('shows negative deltas when after is lower than before', () => {
        const before: GlCountersData = { ...zeroCounters(), useProgram: 5 };
        const after = zeroCounters();

        const table = formatCounterDiff(before, after);

        expect(table.split('\n').some(line => /^useProgram\s+5\s+0\s+-5$/.test(line))).toBe(true);
    });
});
