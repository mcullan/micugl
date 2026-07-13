export type SpringsInFlight = () => boolean;

export type NonReproducible = () => boolean;

export type CaptureBlocker = 'spring' | 'audio' | 'texture';

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

    if (blocker === 'texture') {
        return (
            `${engine}.${method}: a live video or webcam texture is playing. Every frame samples whatever the video `
            + 'or camera happens to be showing right now, so the picture is wall-clock-dependent and a synthesized '
            + 'frame number cannot reproduce it. This export would not reproduce. Pause the video or call stop() on '
            + 'the webcam hook before exporting for a deterministic frame; renderToBlob() with no frame, record() and '
            + 'captureStream() capture the live picture and remain available.'
        );
    }

    return (
        `${engine}.${method}: audio is running. The audio envelope integrates frame to frame, and every frame reads `
        + 'whatever the microphone or media element happens to be playing right now, so a captured frame depends both '
        + 'on the frames rendered before it and on a live input that no frame number can reproduce. This export would '
        + 'not reproduce. Call stop() on the audio hook before exporting; a stopped audio scene captures fine.'
    );
}
