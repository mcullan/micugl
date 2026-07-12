import { describe, expect, it } from 'vitest';

import { selectRecordingMimeType } from '@/react/lib/mimeType';

describe('selectRecordingMimeType', () => {
    it('returns the requested type when supported', () => {
        const isTypeSupported = (type: string): boolean => type === 'video/mp4';
        expect(selectRecordingMimeType(isTypeSupported, 'video/mp4')).toBe('video/mp4');
    });

    it('throws listing supported defaults when the requested type is unsupported', () => {
        const isTypeSupported = (type: string): boolean => type === 'video/webm';
        expect(() => selectRecordingMimeType(isTypeSupported, 'video/mp4')).toThrow(/video\/webm/);
    });

    it('throws mentioning no supported candidates when none of the defaults match either', () => {
        const isTypeSupported = (): boolean => false;
        expect(() => selectRecordingMimeType(isTypeSupported, 'video/mp4')).toThrow(/none/);
    });

    it('picks the first supported default in probe order: vp9 over vp8', () => {
        const isTypeSupported = (type: string): boolean =>
            type === 'video/webm;codecs=vp9' || type === 'video/webm;codecs=vp8';
        expect(selectRecordingMimeType(isTypeSupported)).toBe('video/webm;codecs=vp9');
    });

    it('falls through to a later probe when an earlier one is unsupported', () => {
        const isTypeSupported = (type: string): boolean => type === 'video/webm';
        expect(selectRecordingMimeType(isTypeSupported)).toBe('video/webm');
    });

    it('falls through to video/mp4 when only that default is supported', () => {
        const isTypeSupported = (type: string): boolean => type === 'video/mp4';
        expect(selectRecordingMimeType(isTypeSupported)).toBe('video/mp4');
    });

    it('throws when no default candidate is supported and none was requested', () => {
        const isTypeSupported = (): boolean => false;
        expect(() => selectRecordingMimeType(isTypeSupported)).toThrow(/no supported recording mimeType/);
    });
});
