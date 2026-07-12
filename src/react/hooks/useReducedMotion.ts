import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

interface LegacyMediaQueryList {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
}

function getServerSnapshot(): boolean {
    return false;
}

function getSnapshot(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(QUERY).matches;
}

function unsubscribeNoop(): void {
    return;
}

function subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return unsubscribeNoop;
    }

    const mql = window.matchMedia(QUERY);

    if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', callback);
        return (): void => { mql.removeEventListener('change', callback) };
    }

    const legacyMql = mql as unknown as LegacyMediaQueryList;
    legacyMql.addListener(callback);
    return (): void => { legacyMql.removeListener(callback) };
}

export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
