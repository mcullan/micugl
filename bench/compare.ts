import { readResults, type SceneProjectResult } from './writer';

const flatten = (result: SceneProjectResult): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(result.glCounters as unknown as Record<string, number>)) {
        out[`gl.${key}`] = value;
    }
    for (const [key, value] of Object.entries(result.frameStats as unknown as Record<string, number>)) {
        out[`frame.${key}`] = value;
    }
    out['cdp.taskDuration'] = result.cdp.taskDuration;
    out['cdp.threadTime'] = result.cdp.threadTime;
    return out;
};

const formatNumber = (value: number): string => Number.isInteger(value) ? value.toString() : value.toFixed(2);

const formatPct = (a: number, b: number): string => {
    if (a === 0) {
        return b === 0 ? '0%' : 'n/a';
    }
    return `${(((b - a) / a) * 100).toFixed(1)}%`;
};

const main = (): void => {
    const [shaA, shaB, projectArg] = process.argv.slice(2);
    if (shaA === undefined || shaB === undefined) {
        console.error('usage: bun bench/compare.ts <shaA> <shaB> [project]');
        process.exit(1);
    }

    const project = projectArg ?? 'counters';
    const docA = readResults(shaA);
    const docB = readResults(shaB);
    if (docA === null) {
        console.error(`no results file for ${shaA}`);
        process.exit(1);
    }
    if (docB === null) {
        console.error(`no results file for ${shaB}`);
        process.exit(1);
    }

    const rows: string[] = [];
    rows.push(`Comparing project '${project}': ${shaA.slice(0, 7)} (A) vs ${shaB.slice(0, 7)} (B)`);
    rows.push('');
    rows.push(`| Scene | Metric | A | B | Δ | Δ% |`);
    rows.push(`| --- | --- | ---: | ---: | ---: | ---: |`);

    for (const scene of Object.keys(docB.scenes).sort()) {
        const a = docA.scenes[scene]?.[project];
        const b = docB.scenes[scene]?.[project];
        if (a === undefined || b === undefined) {
            continue;
        }
        const flatA = flatten(a);
        const flatB = flatten(b);
        for (const metric of Object.keys(flatB).sort()) {
            const valueA = flatA[metric] ?? 0;
            const valueB = flatB[metric] ?? 0;
            rows.push(
                `| ${scene} | ${metric} | ${formatNumber(valueA)} | ${formatNumber(valueB)} | ${formatNumber(valueB - valueA)} | ${formatPct(valueA, valueB)} |`
            );
        }
    }

    console.log(rows.join('\n'));
};

main();
