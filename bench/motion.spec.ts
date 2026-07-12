import { expect, test } from '@playwright/test';

import { instrumentationInitScript } from './instrument';

const SETTLE_MS = 500;

test('prefers-reduced-motion freezes the loop without tearing down the engine', async ({ page }) => {
    await page.addInitScript({ content: instrumentationInitScript });

    await page.goto('/?scene=reduced-motion', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__micuglInstrumentation.counters.snapshot().contextsCreated > 0);
    await page.waitForTimeout(SETTLE_MS);

    const contextsBefore = (await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot())).contextsCreated;

    const activeBefore = await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot().drawArrays);
    await page.waitForTimeout(SETTLE_MS);
    const activeAfter = await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot().drawArrays);
    expect(activeAfter).toBeGreaterThan(activeBefore);

    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });

    await page.waitForTimeout(SETTLE_MS);

    const contextsAfter = (await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot())).contextsCreated;
    expect(contextsAfter).toBe(contextsBefore);

    const gatedBefore = await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot().drawArrays);
    await page.waitForTimeout(SETTLE_MS);
    const gatedAfter = await page.evaluate(() => window.__micuglInstrumentation.counters.snapshot().drawArrays);
    expect(gatedAfter).toBe(gatedBefore);
});
