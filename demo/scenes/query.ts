export const getQueryString = (name: string): string | null => {
    return new URLSearchParams(window.location.search).get(name);
};

export const getIntQuery = (name: string, fallback: number): number => {
    const raw = getQueryString(name);
    if (raw === null) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return parsed;
};
