import { expect, test } from '@playwright/test';

import type { PingPongShaderHandle, ShaderHandle } from '../src/types';

declare global {
    interface Window {
        __visualHandle?: ShaderHandle;
        __pingpongHandle?: PingPongShaderHandle;
    }
}

test.describe.configure({ mode: 'serial' });

test('renderToDataURL is byte-identical across repeated calls and page reloads', async ({ page }) => {
    await page.goto('/?scene=visual-fixed&frame=30', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__visualHandle !== undefined);

    const first = await page.evaluate(async () => window.__visualHandle?.renderToDataURL());
    const second = await page.evaluate(async () => window.__visualHandle?.renderToDataURL());
    expect(second).toBe(first);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__visualHandle !== undefined);

    const afterReload = await page.evaluate(async () => window.__visualHandle?.renderToDataURL());
    expect(afterReload).toBe(first);
});

test('renderToBlob at a custom resolution produces exact output dimensions', async ({ page }) => {
    await page.goto('/?scene=visual-fixed&frame=30', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__visualHandle !== undefined);

    const dims = await page.evaluate(async () => {
        const blob = await window.__visualHandle?.renderToBlob({ width: 320, height: 180 });
        if (!blob) {
            throw new Error('expected a blob');
        }
        const bitmap = await createImageBitmap(blob);
        return { width: bitmap.width, height: bitmap.height };
    });

    expect(dims).toEqual({ width: 320, height: 180 });
});

test('renderToBlob({ frame }) matches the dataURL captured via setFrame at the same frame', async ({ page }) => {
    await page.goto('/?scene=visual-fixed', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__visualHandle !== undefined);

    const viaSetFrame = await page.evaluate(async () => {
        window.__visualHandle?.setFrame(30);
        return window.__visualHandle?.renderToDataURL();
    });

    const viaFrameOption = await page.evaluate(async () => {
        const blob = await window.__visualHandle?.renderToBlob({ frame: 30 });
        if (!blob) {
            throw new Error('expected a blob');
        }
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => { resolve(reader.result as string) };
            reader.onerror = () => { reject(new Error('failed to read blob')) };
            reader.readAsDataURL(blob);
        });
    });

    expect(viaFrameOption).toBe(viaSetFrame);
});

test('deterministic frame matches the committed golden screenshot', async ({ page }) => {
    await page.goto('/?scene=visual-fixed&frame=30', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__visualHandle !== undefined);

    await expect(page.locator('canvas')).toHaveScreenshot('visual-fixed-frame-30.png', {
        maxDiffPixels: 50
    });
});

test('a time-pure ping-pong chain resolves renderToBlob({ frame }) instead of throwing', async ({ page }) => {
    await page.goto('/?scene=pingpong-sim', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForFunction(() => window.__pingpongHandle !== undefined);

    const result = await page.evaluate(async () => {
        const handle = window.__pingpongHandle;
        if (!handle) {
            throw new Error('expected a ping-pong handle');
        }
        const blob = await handle.renderToBlob({ frame: 30 });
        const bitmap = await createImageBitmap(blob);
        return { byteLength: blob.size, width: bitmap.width, height: bitmap.height };
    });

    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
});
