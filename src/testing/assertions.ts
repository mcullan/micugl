import type { GlCountersData } from '@/testing/glCounters';

export function diffCounters(before: GlCountersData, after: GlCountersData): GlCountersData {
    return {
        contextsCreated: after.contextsCreated - before.contextsCreated,
        compileShader: after.compileShader - before.compileShader,
        linkProgram: after.linkProgram - before.linkProgram,
        texImage2D: after.texImage2D - before.texImage2D,
        textureBytes: after.textureBytes - before.textureBytes,
        framebufferTexture2D: after.framebufferTexture2D - before.framebufferTexture2D,
        checkFramebufferStatus: after.checkFramebufferStatus - before.checkFramebufferStatus,
        useProgram: after.useProgram - before.useProgram,
        uniformCalls: after.uniformCalls - before.uniformCalls,
        drawArrays: after.drawArrays - before.drawArrays,
        drawArraysInstanced: after.drawArraysInstanced - before.drawArraysInstanced,
        drawElements: after.drawElements - before.drawElements,
        bufferData: after.bufferData - before.bufferData,
        bufferBytes: after.bufferBytes - before.bufferBytes
    };
}

interface CounterDiffRow {
    metric: string;
    before: string;
    after: string;
    delta: string;
}

export function formatCounterDiff(before: GlCountersData, after: GlCountersData): string {
    const diff = diffCounters(before, after);
    const keys = Object.keys(diff) as (keyof GlCountersData)[];
    const columns: (keyof CounterDiffRow)[] = ['metric', 'before', 'after', 'delta'];
    const header: CounterDiffRow = { metric: 'metric', before: 'before', after: 'after', delta: 'delta' };
    const rows: CounterDiffRow[] = keys.map(key => ({
        metric: key,
        before: String(before[key]),
        after: String(after[key]),
        delta: String(diff[key])
    }));
    const widthOf = (column: keyof CounterDiffRow): number =>
        Math.max(header[column].length, ...rows.map(row => row[column].length));
    const widths: Record<keyof CounterDiffRow, number> = {
        metric: widthOf('metric'),
        before: widthOf('before'),
        after: widthOf('after'),
        delta: widthOf('delta')
    };
    const lastColumnIndex = columns.length - 1;
    const formatRow = (row: CounterDiffRow): string =>
        columns
            .map((column, columnIndex) => columnIndex === lastColumnIndex ? row[column] : row[column].padEnd(widths[column]))
            .join('  ');
    return [formatRow(header), ...rows.map(formatRow)].join('\n');
}

export function expectZeroCompiles(before: GlCountersData, after: GlCountersData): void {
    const diff = diffCounters(before, after);
    if (diff.compileShader !== 0 || diff.linkProgram !== 0) {
        throw new Error(
            `micugl/testing: expected zero shader compiles/links, got compileShader delta=${String(diff.compileShader)}, linkProgram delta=${String(diff.linkProgram)}\n${formatCounterDiff(before, after)}`
        );
    }
}

export function expectCounterDeltas(
    before: GlCountersData,
    after: GlCountersData,
    expected: Partial<GlCountersData>
): void {
    const diff = diffCounters(before, after);
    const keys = Object.keys(expected) as (keyof GlCountersData)[];
    const mismatches = keys.filter(key => diff[key] !== expected[key]);
    if (mismatches.length > 0) {
        const details = mismatches
            .map(key => `${key}: expected ${String(expected[key])}, got ${String(diff[key])}`)
            .join('; ');
        throw new Error(
            `micugl/testing: counter deltas did not match expectations (${details})\n${formatCounterDiff(before, after)}`
        );
    }
}

export function expectNoNewContexts(before: GlCountersData, after: GlCountersData): void {
    const diff = diffCounters(before, after);
    if (diff.contextsCreated !== 0) {
        throw new Error(
            `micugl/testing: expected no new WebGL contexts, got contextsCreated delta=${String(diff.contextsCreated)}\n${formatCounterDiff(before, after)}`
        );
    }
}
