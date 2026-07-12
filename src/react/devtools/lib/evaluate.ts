const PARENS = /\(([^()]+)\)/;
const EXPONENT = /(-?\d+(?:\.\d+)?)\s*\^\s*(-?\d+(?:\.\d+)?)/;
const MULDIV = /(-?\d+(?:\.\d+)?)\s*([*/])\s*(-?\d+(?:\.\d+)?)/;
const ADDSUB = /(-?\d+(?:\.\d+)?)\s*([+-])\s*(-?\d+(?:\.\d+)?)/;

function reduce(expression: string): string {
    if (PARENS.test(expression)) {
        return reduce(expression.replace(PARENS, (_match, inner: string) => String(Number(reduce(inner)))));
    }
    if (EXPONENT.test(expression)) {
        return reduce(expression.replace(EXPONENT, (_match, a: string, b: string) =>
            String(Math.pow(Number(a), Number(b)))));
    }
    if (MULDIV.test(expression)) {
        return reduce(expression.replace(MULDIV, (_match, a: string, op: string, b: string) =>
            String(op === '*' ? Number(a) * Number(b) : Number(a) / Number(b))));
    }
    if (ADDSUB.test(expression)) {
        return reduce(expression.replace(ADDSUB, (_match, a: string, op: string, b: string) =>
            String(op === '+' ? Number(a) + Number(b) : Number(a) - Number(b))));
    }
    return expression;
}

export function evaluate(expression: string): number {
    const cleaned = expression.replace(/\s+/g, '');
    if (cleaned.length === 0) {
        throw new Error('micugl devtools: cannot evaluate an empty expression');
    }
    const reduced = reduce(cleaned);
    const value = Number(reduced);
    if (!Number.isFinite(value)) {
        throw new Error(`micugl devtools: cannot evaluate expression "${expression}"`);
    }
    return value;
}
