export function normalizeUniformName(name: string): string {
    return name.startsWith('u_') ? name : `u_${name}`;
}
