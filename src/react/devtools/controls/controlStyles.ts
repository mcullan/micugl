import { COLORS } from '@/react/devtools/lib/theme';

export const NUMBER_FIELD_CLASS = 'micugl-numberfield';
export const NUMBER_FIELD_FLASH_CLASS = 'micugl-numberfield-flash';
const STYLE_MARKER = 'data-micugl-numberfield-style';

export const CONTROL_STYLE_CSS = `
.${NUMBER_FIELD_CLASS}:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 1px;
}
.${NUMBER_FIELD_CLASS}::selection {
    background: ${COLORS.accent};
    color: #0b0d16;
}
.${NUMBER_FIELD_CLASS}.${NUMBER_FIELD_FLASH_CLASS} {
    animation: micugl-numberfield-flash 150ms ease-out;
}
@keyframes micugl-numberfield-flash {
    from { background: ${COLORS.danger}; }
    to { background: transparent; }
}
@media (prefers-reduced-motion: reduce) {
    .${NUMBER_FIELD_CLASS}.${NUMBER_FIELD_FLASH_CLASS} {
        animation: none;
        background: ${COLORS.danger};
    }
}
`;

const injectedRoots = new WeakSet<Node>();

export function ensureControlStyleInjected(root: Node | null | undefined): void {
    if (!root || injectedRoots.has(root)) {
        return;
    }
    if (!(root instanceof ShadowRoot) && !(root instanceof Document)) {
        return;
    }
    if (root.querySelector(`style[${STYLE_MARKER}]`)) {
        injectedRoots.add(root);
        return;
    }
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARKER, '');
    style.textContent = CONTROL_STYLE_CSS;
    root.appendChild(style);
    injectedRoots.add(root);
}
