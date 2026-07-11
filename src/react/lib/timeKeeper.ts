const MS_PER_SECOND = 1000;
const FRAMES_PER_SECOND = 60;

export interface TimeKeeperState {
    accumulatedMs: number;
    lastTickMs: number;
    speed: number;
}

export function createTimeKeeper(speed = 1, now = 0): TimeKeeperState {
    return { accumulatedMs: 0, lastTickMs: now, speed };
}

export function tick(state: TimeKeeperState, now: number): TimeKeeperState {
    return {
        accumulatedMs: state.accumulatedMs + (now - state.lastTickMs) * state.speed,
        lastTickMs: now,
        speed: state.speed
    };
}

export function sync(state: TimeKeeperState, now: number): TimeKeeperState {
    return { accumulatedMs: state.accumulatedMs, lastTickMs: now, speed: state.speed };
}

export function setSpeed(state: TimeKeeperState, speed: number, now: number): TimeKeeperState {
    const settled = tick(state, now);
    return { accumulatedMs: settled.accumulatedMs, lastTickMs: now, speed };
}

export function frameToMs(frame: number): number {
    return (frame / FRAMES_PER_SECOND) * MS_PER_SECOND;
}

export function msToFrame(ms: number): number {
    return (ms / MS_PER_SECOND) * FRAMES_PER_SECOND;
}

export function setFrame(state: TimeKeeperState, frame: number, now: number): TimeKeeperState {
    return { accumulatedMs: frameToMs(frame), lastTickMs: now, speed: state.speed };
}

export function elapsedMs(state: TimeKeeperState): number {
    return state.accumulatedMs;
}

export function currentFrame(state: TimeKeeperState): number {
    return msToFrame(state.accumulatedMs);
}
