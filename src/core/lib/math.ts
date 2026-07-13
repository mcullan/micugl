export function isPowerOfTwo(value: number): boolean {
    return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
