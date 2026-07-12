import { useSyncExternalStore } from 'react';

function getServerSnapshot(): boolean {
    return false;
}

function getSnapshot(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }
    return navigator.connection?.saveData === true;
}

function unsubscribeNoop(): void {
    return;
}

function subscribe(callback: () => void): () => void {
    if (typeof navigator === 'undefined') {
        return unsubscribeNoop;
    }

    const connection = navigator.connection;
    if (!connection || typeof connection.addEventListener !== 'function') {
        return unsubscribeNoop;
    }

    connection.addEventListener('change', callback);
    return (): void => { connection.removeEventListener?.('change', callback) };
}

export function useSaveData(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
