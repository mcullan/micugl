import { RenderPass, WebGLManager } from '..';
export declare class Passes {
    private webglManager;
    private passes;
    private pingPongIds;
    constructor(webglManager: WebGLManager);
    addPass(pass: RenderPass): void;
    clearPasses(): void;
    execute(time: number): void;
    initializeResources(): void;
}
