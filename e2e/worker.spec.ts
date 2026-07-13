import { expect, type Locator, type Page, test } from '@playwright/test';

import type { WorkerContextLossHandles } from '../demo/scenes/WorkerContextLoss';
import type { WorkerDemoHandles } from '../demo/scenes/WorkerJank';
import type { GlCountersData } from '../src/testing/glCounters';
import { instrumentationInitScript } from '../src/testing/glCounters';
import { differingPixelFraction, distinctColors, meanRgb } from './pixels';
import { workerProbeInitScript } from './probes';
import { BUILT_URL, DEV_URL } from './servers';

const BLOCK_MS = 500;
const SETTLE_MS = 800;
const IDLE_MS = 300;

const MOVED_FRACTION = 0.2;
const NOISE_TOLERANCE = 24;

type CanvasProbe = 'transferred-to-worker' | 'main-thread-context' | 'no-context' | 'no-canvas';

interface WorkerEvidence {
    workerUrls: string[];
    mainThreadContexts: number;
    workerCanvas: CanvasProbe;
    mainCanvas: CanvasProbe;
}

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

const bootstrap = async (page: Page): Promise<void> => {
    await page.addInitScript({ content: workerProbeInitScript });
    await page.addInitScript({ content: instrumentationInitScript });
};

const probeCanvases = (): { worker: CanvasProbe; main: CanvasProbe } => {
    const probe = (hostId: string): CanvasProbe => {
        const canvas = document.querySelector(`#${hostId} canvas`);
        if (!(canvas instanceof HTMLCanvasElement)) {
            return 'no-canvas';
        }
        try {
            return canvas.getContext('webgl') === null ? 'no-context' : 'main-thread-context';
        } catch {
            return 'transferred-to-worker';
        }
    };
    return { worker: probe('worker-host'), main: probe('main-host') };
};

const readEvidence = async (page: Page): Promise<WorkerEvidence> => {
    const counters: GlCountersData = await page.evaluate(
        () => window.__micuglInstrumentation.counters.snapshot()
    );
    const workerUrls = await page.evaluate(() => window.__workerProbe.urls);
    const canvases = await page.evaluate(probeCanvases);

    return {
        workerUrls,
        mainThreadContexts: counters.contextsCreated,
        workerCanvas: canvases.worker,
        mainCanvas: canvases.main
    };
};

const waitForPaint = async (canvas: Locator): Promise<void> => {
    await expect.poll(
        async () => distinctColors(await canvas.screenshot()),
        { message: 'canvas never painted anything but a single flat color', timeout: 10_000 }
    ).toBeGreaterThan(4);
};

const openScene = async (page: Page, url: string): Promise<void> => {
    await bootstrap(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#worker-host canvas', { state: 'attached' });
    await page.waitForTimeout(SETTLE_MS);
};

const serveWithCsp = async (page: Page, csp: string): Promise<void> => {
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document') {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        await route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy': csp }
        });
    });
};

const jankBurst = (page: Page): Promise<number> => page.evaluate(blockMs => {
    const demo: WorkerDemoHandles | undefined = window.__workerDemo;
    if (!demo) {
        throw new Error('the worker-jank scene did not expose window.__workerDemo');
    }
    demo.startAll();
    const spins = demo.blockMainThread(blockMs);
    demo.stopAll();
    return spins;
}, BLOCK_MS);

const stopAll = (page: Page): Promise<void> => page.evaluate(() => {
    const demo: WorkerDemoHandles | undefined = window.__workerDemo;
    if (!demo) {
        throw new Error('the worker-jank scene did not expose window.__workerDemo');
    }
    demo.stopAll();
});

interface Target {
    name: string;
    url: string;
    workerUrlPattern: RegExp;
}

const DEV_WORKER_URL = /^\/.*workerEntry\.ts\?worker_file/;
const BLOB_WORKER_URL = /^blob:/;

const targets: Target[] = [
    { name: 'dev server, module worker', url: DEV_URL, workerUrlPattern: DEV_WORKER_URL },
    { name: 'production build, inlined blob worker', url: BUILT_URL, workerUrlPattern: BLOB_WORKER_URL }
];

test.describe.configure({ mode: 'serial' });

for (const target of targets) {
    test(`worker mode renders from a real worker (${target.name})`, async ({ page }) => {
        const watch = watchPage(page);
        await openScene(page, `${target.url}/?scene=worker-jank`);

        const evidence = await readEvidence(page);

        expect(evidence.workerUrls).toHaveLength(1);
        expect(evidence.workerUrls[0]).toMatch(target.workerUrlPattern);
        expect(evidence.workerCanvas).toBe('transferred-to-worker');
        expect(evidence.mainCanvas).toBe('main-thread-context');
        expect(evidence.mainThreadContexts).toBe(1);

        await waitForPaint(page.locator('#worker-host canvas'));

        expect(watch.pageErrors).toEqual([]);
        expect(watch.consoleErrors).toEqual([]);
    });

    test(`main-thread jank does not stall the worker canvas (${target.name})`, async ({ page }) => {
        const watch = watchPage(page);
        await openScene(page, `${target.url}/?scene=worker-jank`);

        const workerCanvas = page.locator('#worker-host canvas');
        const mainCanvas = page.locator('#main-host canvas');

        const evidence = await readEvidence(page);
        expect(evidence.workerCanvas).toBe('transferred-to-worker');
        expect(evidence.mainThreadContexts).toBe(1);

        await stopAll(page);
        await page.waitForTimeout(IDLE_MS);

        const workerBefore = await workerCanvas.screenshot();
        const mainBefore = await mainCanvas.screenshot();
        await page.waitForTimeout(IDLE_MS);

        expect(differingPixelFraction(workerBefore, await workerCanvas.screenshot())).toBe(0);
        expect(differingPixelFraction(mainBefore, await mainCanvas.screenshot())).toBe(0);

        const spins = await jankBurst(page);
        expect(spins).toBeGreaterThan(0);
        await page.waitForTimeout(IDLE_MS);

        const workerAfter = await workerCanvas.screenshot();
        const mainAfter = await mainCanvas.screenshot();

        expect(differingPixelFraction(workerBefore, workerAfter, NOISE_TOLERANCE))
            .toBeGreaterThan(MOVED_FRACTION);
        expect(differingPixelFraction(mainBefore, mainAfter)).toBe(0);

        expect(watch.pageErrors).toEqual([]);
        expect(watch.consoleErrors).toEqual([]);
    });
}

test('StrictMode double mount transfers the canvas exactly once (dev server)', async ({ page }) => {
    const watch = watchPage(page);
    await openScene(page, `${DEV_URL}/?scene=worker-jank&mode=worker&strict=1`);

    const evidence = await readEvidence(page);

    expect(evidence.workerUrls).toHaveLength(2);
    expect(await page.locator('#worker-host canvas').count()).toBe(1);
    expect(evidence.workerCanvas).toBe('transferred-to-worker');
    expect(evidence.mainThreadContexts).toBe(0);

    await waitForPaint(page.locator('#worker-host canvas'));

    expect(watch.pageErrors).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
});

test('a React state change reaches a worker uniform (dev server)', async ({ page }) => {
    const watch = watchPage(page);
    await openScene(page, `${DEV_URL}/?scene=worker-jank`);

    const workerCanvas = page.locator('#worker-host canvas');
    const evidence = await readEvidence(page);
    expect(evidence.workerCanvas).toBe('transferred-to-worker');

    const [greenRed, greenGreen] = meanRgb(await workerCanvas.screenshot());
    expect(greenGreen).toBeGreaterThan(greenRed);

    await page.evaluate(() => {
        const demo: WorkerDemoHandles | undefined = window.__workerDemo;
        if (!demo) {
            throw new Error('the worker-jank scene did not expose window.__workerDemo');
        }
        demo.setColor('red');
    });
    await page.waitForTimeout(IDLE_MS);

    const [redRed, redGreen] = meanRgb(await workerCanvas.screenshot());
    expect(redRed).toBeGreaterThan(redGreen);

    expect(watch.pageErrors).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
});

test('a worker context loss is recovered on restore (dev server)', async ({ page }) => {
    const watch = watchPage(page);
    await bootstrap(page);
    await page.goto(`${DEV_URL}/?scene=worker-context-loss`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#worker-host canvas', { state: 'attached' });
    await page.waitForTimeout(SETTLE_MS);

    const canvas = page.locator('#worker-host canvas');

    const workerUrls = await page.evaluate(() => window.__workerProbe.urls);
    expect(workerUrls).toHaveLength(1);
    expect(workerUrls[0]).toMatch(/^http:\/\/localhost:.*contextLossWorker/);

    const canvasProbe = await page.evaluate(probeCanvases);
    expect(canvasProbe.worker).toBe('transferred-to-worker');

    const running = await canvas.screenshot();
    await page.waitForTimeout(IDLE_MS);
    expect(differingPixelFraction(running, await canvas.screenshot(), NOISE_TOLERANCE))
        .toBeGreaterThan(0);

    await page.evaluate(() => {
        const handles: WorkerContextLossHandles | undefined = window.__workerContextLoss;
        if (!handles) {
            throw new Error('the worker-context-loss scene did not expose window.__workerContextLoss');
        }
        handles.loseContext();
    });
    await page.waitForTimeout(SETTLE_MS);

    const lost = await canvas.screenshot();
    await page.waitForTimeout(IDLE_MS);
    expect(differingPixelFraction(lost, await canvas.screenshot())).toBe(0);

    await page.evaluate(() => {
        const handles: WorkerContextLossHandles | undefined = window.__workerContextLoss;
        if (!handles) {
            throw new Error('the worker-context-loss scene did not expose window.__workerContextLoss');
        }
        handles.restoreContext();
    });
    await page.waitForTimeout(SETTLE_MS);

    const restored = await canvas.screenshot();
    await page.waitForTimeout(IDLE_MS);
    expect(differingPixelFraction(restored, await canvas.screenshot(), NOISE_TOLERANCE))
        .toBeGreaterThan(0);

    expect(await page.locator('#worker-host canvas').count()).toBe(1);
    expect(watch.pageErrors).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
});

test('a CSP that forbids blob workers falls back to the main thread (production build)', async ({ page }) => {
    const watch = watchPage(page);
    await bootstrap(page);
    await serveWithCsp(page, "worker-src 'self';");
    await page.goto(`${BUILT_URL}/?scene=worker-jank`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#worker-host canvas', { state: 'attached' });
    await page.waitForTimeout(SETTLE_MS);

    const evidence = await readEvidence(page);

    expect(evidence.workerUrls).toHaveLength(1);
    expect(evidence.workerUrls[0]).toMatch(/^blob:/);
    expect(evidence.workerCanvas).toBe('main-thread-context');
    expect(evidence.mainCanvas).toBe('main-thread-context');
    expect(evidence.mainThreadContexts).toBe(2);

    await waitForPaint(page.locator('#worker-host canvas'));

    const canvas = page.locator('#worker-host canvas');
    const first = await canvas.screenshot();
    await page.waitForTimeout(IDLE_MS);
    expect(differingPixelFraction(first, await canvas.screenshot(), NOISE_TOLERANCE)).toBeGreaterThan(0);

    const refusals = watch.consoleErrors.filter(text => text.includes('Content Security Policy'));
    const micuglLogs = watch.consoleErrors.filter(text => text.startsWith('micugl worker:'));
    const others = watch.consoleErrors.filter(
        text => !text.includes('Content Security Policy') && !text.startsWith('micugl worker:')
    );

    expect(refusals).toHaveLength(1);
    expect(micuglLogs).toHaveLength(1);
    expect(micuglLogs[0]).toContain('worker-src \'self\' blob:');
    expect(micuglLogs[0]).toContain('createWorker');
    expect(micuglLogs[0]).toContain('Rendering on the main thread instead');
    expect(others).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
});

test('the documented CSP remedy lets the blob worker start (production build)', async ({ page }) => {
    const watch = watchPage(page);
    await bootstrap(page);
    await serveWithCsp(page, "worker-src 'self' blob:;");
    await page.goto(`${BUILT_URL}/?scene=worker-jank`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#worker-host canvas', { state: 'attached' });
    await page.waitForTimeout(SETTLE_MS);

    const evidence = await readEvidence(page);

    expect(evidence.workerUrls[0]).toMatch(/^blob:/);
    expect(evidence.workerCanvas).toBe('transferred-to-worker');
    expect(evidence.mainThreadContexts).toBe(1);

    await waitForPaint(page.locator('#worker-host canvas'));

    expect(watch.pageErrors).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
});
