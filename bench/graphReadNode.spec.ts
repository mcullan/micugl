import { expect, test } from '@playwright/test';

import { DEV_URL } from '../e2e/servers';

interface Center {
    r: number;
    g: number;
    b: number;
    unreadable?: string;
}

interface ReadNodeProbe {
    a: Center;
    b: Center;
    root: Center;
    rowLow: number;
    rowHigh: number;
}

test('readNode attributes pixels per node and returns raw bottom-up rows', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${DEV_URL}/?scene=graph-pixels`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForTimeout(600);

    const probe: ReadNodeProbe = await page.evaluate(() => {
        interface ReadResult {
            width: number;
            height: number;
            pixels: Uint8ClampedArray;
        }
        interface Unreadable {
            unreadable: string;
        }
        type NodeRead = ReadResult | Unreadable;
        interface GraphPort {
            readNode: (id: string) => NodeRead;
        }
        interface Handle {
            graph?: GraphPort;
        }
        const list = (window as unknown as { __listGraphEngines?: () => Handle[] }).__listGraphEngines;
        if (!list) {
            throw new Error('the graph-pixels scene did not expose __listGraphEngines');
        }
        const engines = list();
        const graph = engines[engines.length - 1]?.graph;
        if (!graph) {
            throw new Error('the graph-pixels engine exposed no graph port');
        }
        const center = (read: NodeRead): Center => {
            if ('unreadable' in read) {
                return { r: -1, g: -1, b: -1, unreadable: read.unreadable };
            }
            const x = Math.floor(read.width / 2);
            const y = Math.floor(read.height / 2);
            const i = (y * read.width + x) * 4;
            return { r: read.pixels[i], g: read.pixels[i + 1], b: read.pixels[i + 2] };
        };
        const a = graph.readNode('a');
        const b = graph.readNode('b');
        const root = graph.readNode('root');
        let rowLow = -1;
        let rowHigh = -1;
        if (!('unreadable' in a)) {
            const x = Math.floor(a.width / 2);
            rowLow = a.pixels[(0 * a.width + x) * 4];
            rowHigh = a.pixels[((a.height - 1) * a.width + x) * 4];
        }
        return { a: center(a), b: center(b), root: center(root), rowLow, rowHigh };
    });

    expect(probe.a.unreadable).toBeUndefined();
    expect(probe.a.r).toBeGreaterThan(120);
    expect(probe.a.b).toBeLessThan(60);

    expect(probe.b.b).toBeGreaterThan(150);
    expect(probe.b.r).toBeLessThan(60);

    expect(probe.root.r).toBeGreaterThan(30);
    expect(probe.root.b).toBeGreaterThan(60);

    expect(probe.rowLow).toBeLessThan(probe.rowHigh - 40);

    expect(pageErrors).toEqual([]);
});
