const DEFAULT_MIME_TYPE_PROBES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
];

export function selectRecordingMimeType(
    isTypeSupported: (type: string) => boolean,
    requested?: string
): string {
    if (requested !== undefined) {
        if (isTypeSupported(requested)) {
            return requested;
        }

        const supported = DEFAULT_MIME_TYPE_PROBES.filter(isTypeSupported);
        throw new Error(
            `selectRecordingMimeType: requested mimeType "${requested}" is not supported; ` +
            `supported candidates: ${supported.length > 0 ? supported.join(', ') : 'none'}`
        );
    }

    const supported = DEFAULT_MIME_TYPE_PROBES.find(isTypeSupported);
    if (supported === undefined) {
        throw new Error(
            `selectRecordingMimeType: no supported recording mimeType found; tried: ${DEFAULT_MIME_TYPE_PROBES.join(', ')}`
        );
    }
    return supported;
}
