import { expect, test } from '@playwright/test';

import type { ShaderHandle } from '../src/types';

declare global {
    interface Window {
        __exportDemoHandle?: ShaderHandle;
        __reducedMotionHandle?: ShaderHandle;
    }
}

test.describe.configure({ mode: 'serial' });

test('renderSequence encodes a webm blob at the given fps/frames', async ({ page }) => {
    await page.goto('/?scene=export-demo', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__exportDemoHandle !== undefined);

    const result = await page.evaluate(async () => {
        const blob = await window.__exportDemoHandle?.renderSequence({ fps: 30, frames: 30 });
        return blob ? { type: blob.type, size: blob.size } : null;
    });

    expect(result).not.toBeNull();
    expect(result?.type).toBe('video/webm');
    expect(result?.size).toBeGreaterThan(5000);
});

test('renderSequence with container:"none" streams raw frames via onFrame and returns null', async ({ page }) => {
    await page.goto('/?scene=export-demo', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__exportDemoHandle !== undefined);

    const result = await page.evaluate(async () => {
        let count = 0;
        const blob = await window.__exportDemoHandle?.renderSequence({
            fps: 30,
            frames: 30,
            container: 'none',
            onFrame: () => { count += 1 }
        });
        return { count, blob };
    });

    expect(result.count).toBe(30);
    expect(result.blob).toBeNull();
});

test('record() captures a real-time webm recording', async ({ page }) => {
    await page.goto('/?scene=export-demo', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__exportDemoHandle !== undefined);

    const result = await page.evaluate(async () => {
        const recording = window.__exportDemoHandle?.record({ fps: 60 });
        if (!recording) {
            throw new Error('expected a recording');
        }
        await new Promise(resolve => { setTimeout(resolve, 600) });
        const blob = await recording.stop();
        return { type: blob.type, size: blob.size };
    });

    expect(result.type).toMatch(/^video\/webm/);
    expect(result.size).toBeGreaterThan(0);
});

test('renderSequence rejects when both frames and durationSeconds are given', async ({ page }) => {
    await page.goto('/?scene=export-demo', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__exportDemoHandle !== undefined);

    const message = await page.evaluate(async () => {
        try {
            await window.__exportDemoHandle?.renderSequence({ fps: 30, frames: 10, durationSeconds: 1 });
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    });

    expect(message).toMatch(/exactly one/);
});

test('record() rejects while the engine is motion-gated', async ({ page }) => {
    await page.goto('/?scene=reduced-motion', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__reducedMotionHandle !== undefined);

    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await page.waitForTimeout(500);

    const message = await page.evaluate(() => {
        try {
            window.__reducedMotionHandle?.record();
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    });

    expect(message).toMatch(/motion-gated/);
});
