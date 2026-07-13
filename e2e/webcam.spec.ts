import { expect, type Page, test } from '@playwright/test';

import type { GlCountersData } from '../src/testing/glCounters';
import { instrumentationInitScript } from '../src/testing/glCounters';
import { differingPixelFraction } from './pixels';
import { DEV_URL } from './servers';

const NOISE_TOLERANCE = 24;
const SETTLE_MS = 250;

test.use({
    launchOptions: {
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    }
});

interface PageWatch {
    pageErrors: string[];
    consoleErrors: string[];
}

const watchPage = (page: Page): PageWatch => {
    const watch: PageWatch = { pageErrors: [], consoleErrors: [] };
    page.on('pageerror', error => watch.pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') {
            watch.consoleErrors.push(message.text());
        }
    });
    return watch;
};

const uploadCount = async (page: Page): Promise<number> => {
    const counters: GlCountersData = await page.evaluate(
        () => window.__micuglInstrumentation.counters.snapshot()
    );
    return counters.texImage2D;
};

test('the webcam scene renders a live camera and freezes when disabled', async ({ page }) => {
    const watch = watchPage(page);
    await page.addInitScript({ content: instrumentationInitScript });
    await page.goto(`${DEV_URL}/?scene=webcam`, { waitUntil: 'domcontentloaded' });

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'attached' });

    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('camera status: running')).toBeVisible({ timeout: 10_000 });

    const uploadsBeforeMotion = await uploadCount(page);

    await expect
        .poll(async () => {
            const first = await canvas.screenshot();
            await page.waitForTimeout(120);
            const second = await canvas.screenshot();
            return differingPixelFraction(first, second, NOISE_TOLERANCE);
        }, { message: 'the enabled webcam canvas never changed across two samples', timeout: 10_000 })
        .toBeGreaterThan(0);

    const uploadsAfterMotion = await uploadCount(page);
    expect(uploadsAfterMotion).toBeGreaterThan(uploadsBeforeMotion);

    await page.getByRole('button', { name: 'Disable camera' }).click();
    await expect(page.getByText('camera status: stopped')).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(SETTLE_MS);
    const frozenBefore = await canvas.screenshot();
    await page.waitForTimeout(SETTLE_MS);
    const frozenAfter = await canvas.screenshot();

    expect(differingPixelFraction(frozenBefore, frozenAfter, NOISE_TOLERANCE)).toBe(0);

    expect(watch.pageErrors).toEqual([]);
});
