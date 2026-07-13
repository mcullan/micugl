import type { EasingFn, EasingName } from '@/types';

const EASINGS: Record<EasingName, EasingFn> = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => 1 - (1 - t) * (1 - t),
    easeInOut: t => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
};

export function resolveEasing(easing: EasingName | EasingFn | undefined): EasingFn {
    if (easing === undefined) {
        return EASINGS.linear;
    }
    if (typeof easing === 'function') {
        return easing;
    }
    if (!Object.prototype.hasOwnProperty.call(EASINGS, easing)) {
        throw new Error(`micugl transitions: unknown easing "${String(easing)}"`);
    }
    return EASINGS[easing];
}
