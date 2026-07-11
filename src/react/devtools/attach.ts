import { createElement } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { MicuglDevtools } from '@/react/devtools/MicuglDevtools';

const ROOT_ATTRIBUTE = 'data-micugl-devtools-root';

let root: Root | null = null;
let container: HTMLElement | null = null;

export const ensureDevtoolsMounted = (): void => {
    if (typeof document === 'undefined') {
        return;
    }
    if (root) {
        return;
    }
    if (document.querySelector(`[${ROOT_ATTRIBUTE}]`)) {
        throw new Error(
            'micugl devtools: a devtools root already exists but was not created by this module. '
            + 'This usually means two copies of micugl/devtools were loaded.'
        );
    }
    container = document.createElement('div');
    container.setAttribute(ROOT_ATTRIBUTE, '');
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(createElement(MicuglDevtools));
};

export const unmountDevtools = (): void => {
    if (root) {
        root.unmount();
        root = null;
    }
    if (container) {
        container.remove();
        container = null;
    }
};
