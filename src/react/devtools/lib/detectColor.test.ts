import { describe, expect, it } from 'vitest';

import { isColorUniform } from '@/react/devtools/lib/detectColor';

describe('isColorUniform', () => {
    it('matches the u_color convention', () => {
        expect(isColorUniform('u_color')).toBe(true);
    });

    it('matches names with a color suffix', () => {
        expect(isColorUniform('u_tintColor')).toBe(true);
    });

    it('matches names with a color-prefixed suffix', () => {
        expect(isColorUniform('u_colorA')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(isColorUniform('U_COLOR')).toBe(true);
    });

    it('does not match unrelated names', () => {
        expect(isColorUniform('u_scale')).toBe(false);
    });

    it('does not match the empty string', () => {
        expect(isColorUniform('')).toBe(false);
    });
});
