import type { EngineDebugState } from '@/react/devtools/beacon';

export const isEngineStateUnavailable = (state: EngineDebugState): boolean => {
    const { canvas, programIds, framebufferIds } = state;
    return (
        programIds.length === 0
        && framebufferIds.length === 0
        && canvas.renderWidth === 0
        && canvas.renderHeight === 0
        && canvas.displayWidth === 0
        && canvas.displayHeight === 0
    );
};
