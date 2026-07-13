export type SpringsInFlight = () => boolean;

export type NonReproducible = () => boolean;

export type CaptureBlocker = 'spring' | 'audio';

export type CapturesAreNonReproducible = () => CaptureBlocker | null;

export function nonReproducibleCaptureMessage(
    engine: string,
    method: string,
    blocker: CaptureBlocker
): string {
    if (blocker === 'spring') {
        return (
            `${engine}.${method}: a spring transition is still in flight. Springs integrate frame to frame, so a `
            + 'captured frame depends on the frames rendered before it, and this export would not reproduce. Wait for '
            + 'the spring to settle, or use a tween transition, which is deterministic under setFrame.'
        );
    }

    return (
        `${engine}.${method}: audio is running. The audio envelope integrates frame to frame, and every frame reads `
        + 'whatever the microphone or media element happens to be playing right now, so a captured frame depends both '
        + 'on the frames rendered before it and on a live input that no frame number can reproduce. This export would '
        + 'not reproduce. Call stop() on the audio hook before exporting; a stopped audio scene captures fine.'
    );
}
