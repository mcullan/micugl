export type SpringsInFlight = () => boolean;

export function springInFlightMessage(engine: string, method: string): string {
    return (
        `${engine}.${method}: a spring transition is still in flight. Springs integrate frame to frame, so a `
        + 'captured frame depends on the frames rendered before it, and this export would not reproduce. Wait for '
        + 'the spring to settle, or use a tween transition, which is deterministic under setFrame.'
    );
}
