import type { RenderPass } from '@/types';

export function chainIsTimePure(passes: RenderPass[]): boolean {
    const written = new Set<string>();

    for (const pass of passes) {
        for (const input of pass.inputTextures) {
            if (input.bindingType === 'readwrite') {
                return false;
            }
            const readsAnFbo = input.bindingType === 'read' || input.bindingType === 'node';
            if (readsAnFbo && !written.has(input.id)) {
                return false;
            }
        }

        if (pass.outputFramebuffer != null) {
            const id = pass.outputFramebuffer;
            const clears = pass.renderOptions?.clear ?? true;

            if (!clears) {
                return false;
            }

            written.add(id);
        }
    }

    return true;
}
