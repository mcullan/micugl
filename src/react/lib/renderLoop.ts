import type { MotionGate } from '@/react/lib/motionPolicy';
import { shouldSchedule } from '@/react/lib/shouldSchedule';
import {
    createTimeKeeper,
    currentFrame,
    elapsedMs,
    setFrame as setTimeFrame,
    setSpeed as setTimeSpeed,
    sync as syncTime,
    tick as tickTime,
    type TimeKeeperState
} from '@/react/lib/timeKeeper';
import type { Frameloop } from '@/types';

export interface RenderLoopDeps {
    requestAnimationFrame: (callback: (now: number) => void) => number;
    cancelAnimationFrame: (handle: number) => void;
    now: () => number;
    render: (elapsed: number) => void;
    frameloop?: Frameloop;
    speed?: number;
    pauseWhenHidden?: boolean;
}

export class RenderLoop {
    private deps: RenderLoopDeps;
    private time: TimeKeeperState;
    private frameloop: Frameloop;
    private pauseWhenHidden: boolean;
    private documentVisible = true;
    private intersecting = true;
    private pendingInvalidate = false;
    private running = false;
    private handle: number | null = null;
    private cold = true;
    private motionGate: MotionGate = 'none';

    constructor(deps: RenderLoopDeps) {
        this.deps = deps;
        this.frameloop = deps.frameloop ?? 'always';
        this.pauseWhenHidden = deps.pauseWhenHidden ?? true;
        this.time = createTimeKeeper(deps.speed ?? 1, deps.now());
    }

    private visible(): boolean {
        if (!this.pauseWhenHidden) {
            return true;
        }
        return this.documentVisible && this.intersecting;
    }

    private paused(): boolean {
        return !this.running || !this.visible() || this.time.speed === 0;
    }

    private evaluate(): void {
        if (this.paused()) {
            this.cold = true;
            if (this.handle !== null) {
                this.deps.cancelAnimationFrame(this.handle);
                this.handle = null;
            }
            return;
        }

        const should = shouldSchedule({
            frameloop: this.frameloop,
            speed: this.time.speed,
            documentVisible: this.documentVisible,
            intersecting: this.intersecting,
            pauseWhenHidden: this.pauseWhenHidden,
            pendingInvalidate: this.pendingInvalidate,
            motionGate: this.motionGate
        });

        if (should && this.handle === null) {
            this.handle = this.deps.requestAnimationFrame(this.frame);
        } else if (!should && this.handle !== null) {
            this.deps.cancelAnimationFrame(this.handle);
            this.handle = null;
        }
    }

    private frame = (now: number): void => {
        this.handle = null;
        this.pendingInvalidate = false;

        if (this.motionGate !== 'none') {
            this.time = syncTime(this.time, now);
        } else if (this.cold) {
            this.time = syncTime(this.time, now);
            this.cold = false;
        } else {
            this.time = tickTime(this.time, now);
        }

        this.deps.render(elapsedMs(this.time));
        this.evaluate();
    };

    private onVisibilityTransition(before: boolean): void {
        if (this.visible() && !before) {
            this.invalidate();
        } else {
            this.evaluate();
        }
    }

    start(): void {
        this.running = true;
        this.invalidate();
    }

    stop(): void {
        this.running = false;
        this.evaluate();
    }

    invalidate(): void {
        this.pendingInvalidate = true;
        this.evaluate();
    }

    setFrame(frame: number): void {
        this.time = setTimeFrame(this.time, frame, this.deps.now());
        this.cold = true;
        this.deps.render(elapsedMs(this.time));
        this.evaluate();
    }

    getFrame(): number {
        return currentFrame(this.time);
    }

    getFrameloop(): Frameloop {
        return this.frameloop;
    }

    getSpeed(): number {
        return this.time.speed;
    }

    getMotionGate(): MotionGate {
        return this.motionGate;
    }

    setMotionGate(gate: MotionGate): void {
        if (this.motionGate === gate) {
            return;
        }
        this.motionGate = gate;
        this.cold = true;
        this.evaluate();
    }

    isPaused(): boolean {
        return this.paused();
    }

    setSpeed(speed: number): void {
        const now = this.deps.now();
        const base = this.cold ? syncTime(this.time, now) : this.time;
        this.time = setTimeSpeed(base, speed, now);
        this.evaluate();
    }

    setFrameloop(frameloop: Frameloop): void {
        this.frameloop = frameloop;
        this.evaluate();
    }

    setPauseWhenHidden(pauseWhenHidden: boolean): void {
        const before = this.visible();
        this.pauseWhenHidden = pauseWhenHidden;
        this.onVisibilityTransition(before);
    }

    setVisible(documentVisible: boolean): void {
        const before = this.visible();
        this.documentVisible = documentVisible;
        this.onVisibilityTransition(before);
    }

    setIntersecting(intersecting: boolean): void {
        const before = this.visible();
        this.intersecting = intersecting;
        this.onVisibilityTransition(before);
    }
}
