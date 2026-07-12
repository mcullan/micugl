const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

export function clampUnit(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

export function isOutOfGamut(components: readonly number[]): boolean {
    return components.some(component => !Number.isFinite(component) || component < 0 || component > 1);
}

export function componentsToHex(components: readonly number[]): string {
    const toByte = (component: number): string =>
        Math.round(clampUnit(component) * 255).toString(16).padStart(2, '0');
    return `#${components.slice(0, 3).map(toByte).join('')}`;
}

export function hexToComponents(hex: string): [number, number, number] {
    const match = HEX_PATTERN.exec(hex);
    if (!match) {
        throw new Error(`micugl devtools: invalid color hex "${hex}"`);
    }
    const value = match[1];
    return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255
    ];
}
