import { type CDPSession, expect, test } from '@playwright/test';

import { gitSha } from './gitSha';
import { instrumentationInitScript } from './instrument';
import { type SceneProjectResult, writeSceneResult } from './writer';

const MEASUREMENT_MS = 10_000;
const SETTLE_MS = 1_000;

interface SceneSpec {
    name: string;
    query: string;
    iterations: number | null;
    assertDrawArrays: boolean;
    assertDrawArraysInstanced?: boolean;
}

const specs: SceneSpec[] = [
    { name: 'rerender-storm', query: '/?scene=rerender-storm', iterations: null, assertDrawArrays: false },
    { name: 'pingpong-sim', query: '/?scene=pingpong-sim&iterations=4', iterations: 4, assertDrawArrays: true },
    { name: 'static-idle', query: '/?scene=static-idle', iterations: null, assertDrawArrays: false },
    { name: 'offscreen', query: '/?scene=offscreen', iterations: null, assertDrawArrays: false },
    { name: 'many-canvases', query: '/?scene=many-canvases', iterations: null, assertDrawArrays: true },
    { name: 'many-canvases-devtools', query: '/?scene=many-canvases-devtools', iterations: null, assertDrawArrays: true },
    {
        name: 'instanced-particles',
        query: '/?scene=instanced-particles&count=10000',
        iterations: null,
        assertDrawArrays: false,
        assertDrawArraysInstanced: true
    },
    {
        name: 'particles-components',
        query: '/?scene=particles-components&n=12',
        iterations: null,
        assertDrawArrays: true
    }
];

const readMetrics = async (session: CDPSession): Promise<Map<string, number>> => {
    const reply = await session.send('Performance.getMetrics');
    const out = new Map<string, number>();
    for (const metric of reply.metrics) {
        out.set(metric.name, metric.value);
    }
    return out;
};

test.describe.configure({ mode: 'serial' });

for (const spec of specs) {
    test(spec.name, async ({ page }, testInfo) => {
        await page.addInitScript({ content: instrumentationInitScript });

        const session = await page.context().newCDPSession(page);
        await session.send('Performance.enable');

        await page.goto(spec.query, { waitUntil: 'networkidle' });
        await page.waitForSelector('canvas', { state: 'attached' });
        await page.waitForFunction(() => window.__micuglInstrumentation.counters.snapshot().contextsCreated > 0);
        await page.waitForTimeout(SETTLE_MS);

        await page.evaluate(() => { window.__micuglInstrumentation.counters.reset() });
        const before = await readMetrics(session);
        await page.evaluate(() => { window.__micuglInstrumentation.frameSampler.start() });
        await page.waitForTimeout(MEASUREMENT_MS);
        const frameStats = await page.evaluate(() => window.__micuglInstrumentation.frameSampler.stop());
        const glCounters = await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot());
        const after = await readMetrics(session);

        const result: SceneProjectResult = {
            config: {
                measurementMs: MEASUREMENT_MS,
                headless: testInfo.project.name !== 'timing',
                iterations: spec.iterations
            },
            glCounters,
            frameStats,
            cdp: {
                taskDuration: (after.get('TaskDuration') ?? 0) - (before.get('TaskDuration') ?? 0),
                threadTime: (after.get('ThreadTime') ?? 0) - (before.get('ThreadTime') ?? 0)
            }
        };

        writeSceneResult(gitSha, spec.name, testInfo.project.name, result);

        if (testInfo.project.name === 'counters') {
            expect(glCounters.contextsCreated).toBeGreaterThan(0);
            if (spec.assertDrawArrays) {
                expect(glCounters.drawArrays).toBeGreaterThan(0);
            }
            if (spec.assertDrawArraysInstanced) {
                expect(glCounters.drawArraysInstanced).toBeGreaterThan(0);
            }
        }
    });
}
