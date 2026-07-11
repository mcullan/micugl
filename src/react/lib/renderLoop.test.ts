import { beforeEach, describe, expect, it } from 'vitest';

import { RenderLoop, type RenderLoopDeps } from '@/react/lib/renderLoop';
import type { Frameloop } from '@/types';

interface Harness {
    loop: RenderLoop;
    renders: number[];
    pending: number;
    setNow: (value: number) => void;
    flush: (now?: number) => boolean;
}

function harness(overrides: Partial<RenderLoopDeps> = {}): Harness {
    const callbacks = new Map<number, (now: number) => void>();
    let nextHandle = 1;
    let clock = 0;
    const renders: number[] = [];

    const deps: RenderLoopDeps = {
        requestAnimationFrame: (cb) => {
            const handle = nextHandle++;
            callbacks.set(handle, cb);
            return handle;
        },
        cancelAnimationFrame: (handle) => {
            callbacks.delete(handle);
        },
        now: () => clock,
        render: (elapsed) => renders.push(elapsed),
        ...overrides
    };

    const loop = new RenderLoop(deps);

    return {
        loop,
        renders,
        get pending() {
            return callbacks.size;
        },
        setNow: (value) => { clock = value },
        flush: (now) => {
            const entry = callbacks.entries().next();
            if (entry.done) {
                return false;
            }
            const [handle, cb] = entry.value;
            callbacks.delete(handle);
            if (now !== undefined) {
                clock = now;
            }
            cb(clock);
            return true;
        }
    };
}

describe('RenderLoop always mode', () => {
    let h: Harness;

    beforeEach(() => {
        h = harness({ frameloop: 'always' });
        h.loop.start();
    });

    it('reschedules continuously', () => {
        expect(h.pending).toBe(1);
        h.flush(16);
        expect(h.renders).toHaveLength(1);
        expect(h.pending).toBe(1);
        h.flush(32);
        expect(h.renders).toHaveLength(2);
        expect(h.pending).toBe(1);
    });

    it('does not jump time across a pause and resume', () => {
        h.flush(16);
        h.flush(32);
        expect(h.renders[0]).toBe(0);
        expect(h.renders[1]).toBe(16);

        h.loop.setVisible(false);
        expect(h.pending).toBe(0);

        h.setNow(100000);
        h.loop.setVisible(true);
        expect(h.pending).toBe(1);

        h.flush(100016);
        expect(h.renders[2]).toBe(16);

        h.flush(100032);
        expect(h.renders[3]).toBe(32);
    });
});

describe('RenderLoop demand mode', () => {
    let h: Harness;

    beforeEach(() => {
        h = harness({ frameloop: 'demand' });
        h.loop.start();
    });

    it('coalesces multiple invalidations into one render', () => {
        expect(h.pending).toBe(1);
        h.loop.invalidate();
        h.loop.invalidate();
        h.loop.invalidate();
        expect(h.pending).toBe(1);

        h.flush(16);
        expect(h.renders).toHaveLength(1);
        expect(h.pending).toBe(0);
    });

    it('schedules a fresh frame for a later invalidate', () => {
        h.flush(16);
        expect(h.renders).toHaveLength(1);
        expect(h.pending).toBe(0);

        h.loop.invalidate();
        expect(h.pending).toBe(1);
        h.flush(32);
        expect(h.renders).toHaveLength(2);
    });

    it('repaints once on re-entry after being hidden', () => {
        h.flush(16);
        expect(h.pending).toBe(0);

        h.loop.setIntersecting(false);
        expect(h.pending).toBe(0);

        h.loop.setIntersecting(true);
        expect(h.pending).toBe(1);
        h.flush(32);
        expect(h.renders).toHaveLength(2);
        expect(h.pending).toBe(0);
    });

    it('does not repaint a changed live value until invalidate is called', () => {
        let liveValue = 1;
        const seen: number[] = [];
        const demand = harness({ frameloop: 'demand', render: () => { seen.push(liveValue) } });
        demand.loop.start();

        demand.flush(16);
        expect(seen).toEqual([1]);

        liveValue = 2;
        expect(demand.pending).toBe(0);
        demand.flush(32);
        expect(seen).toEqual([1]);

        demand.loop.invalidate();
        expect(demand.pending).toBe(1);
        demand.flush(48);
        expect(seen).toEqual([1, 2]);
    });
});

describe('RenderLoop never mode', () => {
    it('renders one initial frame then stops', () => {
        const h = harness({ frameloop: 'never' });
        h.loop.start();
        expect(h.pending).toBe(1);
        h.flush(16);
        expect(h.renders).toHaveLength(1);
        expect(h.pending).toBe(0);
    });

    it('renders on setFrame even without scheduling', () => {
        const h = harness({ frameloop: 'never' });
        h.loop.start();
        h.flush(16);
        expect(h.renders).toHaveLength(1);

        h.loop.setFrame(120);
        expect(h.renders).toHaveLength(2);
        expect(h.renders[1]).toBe(2000);
        expect(h.loop.getFrame()).toBe(120);
        expect(h.pending).toBe(0);
    });
});

describe('RenderLoop speed and control', () => {
    it('stops scheduling at speed zero and resumes without a time jump', () => {
        const h = harness({ frameloop: 'always' });
        h.loop.start();
        h.flush(16);
        h.flush(32);
        expect(h.renders[1]).toBe(16);

        h.loop.setSpeed(0);
        expect(h.pending).toBe(0);

        h.setNow(50000);
        h.loop.setSpeed(1);
        expect(h.pending).toBe(1);
        h.flush(50016);
        expect(h.renders[2]).toBe(16);
    });

    it('stop halts scheduling like a context-loss hard stop', () => {
        const h = harness({ frameloop: 'always' });
        h.loop.start();
        expect(h.pending).toBe(1);
        h.loop.stop();
        expect(h.pending).toBe(0);
        h.loop.start();
        expect(h.pending).toBe(1);
    });

    it('renders exactly one extra frame for an invalidate raised during a frame', () => {
        let loop: RenderLoop | null = null;
        let raised = false;
        let count = 0;
        const h = harness({
            frameloop: 'demand',
            render: () => {
                count += 1;
                if (!raised) {
                    raised = true;
                    loop?.invalidate();
                }
            }
        });
        loop = h.loop;
        h.loop.start();

        h.flush(16);
        expect(count).toBe(1);
        expect(h.pending).toBe(1);

        h.flush(32);
        expect(count).toBe(2);
        expect(h.pending).toBe(0);
    });

    it('does not accumulate time when speed changes while hidden', () => {
        const h = harness({ frameloop: 'always' });
        h.loop.start();
        h.flush(16);
        h.flush(32);
        expect(h.renders[1]).toBe(16);

        h.loop.setVisible(false);
        h.setNow(60000);
        h.loop.setSpeed(2);

        h.setNow(90000);
        h.loop.setVisible(true);
        h.flush(90016);
        expect(h.renders[2]).toBe(16);
    });

    it('holds a set frame across an idle gap in demand mode', () => {
        const h = harness({ frameloop: 'demand' });
        h.loop.start();
        h.flush(16);

        h.setNow(1000);
        h.loop.setFrame(120);
        expect(h.renders[1]).toBe(2000);

        h.setNow(50000);
        h.loop.invalidate();
        h.flush(50016);
        expect(h.renders[2]).toBe(2000);
        expect(h.loop.getFrame()).toBe(120);
    });

    it('holds time frozen while paused under nonzero speed', () => {
        const modes: Frameloop[] = ['always', 'demand', 'never'];
        for (const frameloop of modes) {
            const h = harness({ frameloop });
            h.loop.start();
            h.flush(10);
            const first = h.renders[0];
            h.loop.setVisible(false);
            h.setNow(9999);
            h.loop.setVisible(true);
            h.flush(10009);
            expect(h.renders[1]).toBe(first);
        }
    });
});
