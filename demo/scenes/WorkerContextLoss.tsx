import { useCallback, useEffect, useRef } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec3 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { UniformParam } from '../../src/types';
import type { ContextLossMessage } from '../workers/contextLossWorker';
import { QUAD_VERTEX, WORKER_BARS_FRAGMENT } from './shaders';

export interface WorkerContextLossHandles {
    loseContext: () => void;
    restoreContext: () => void;
}

declare global {
    interface Window {
        __workerContextLoss?: WorkerContextLossHandles;
    }
}

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WORKER_BARS_FRAGMENT,
    uniformNames: {
        u_color: 'vec3'
    }
});

const uniforms: Record<string, UniformParam> = {
    u_color: { type: 'vec3', value: vec3([0.15, 1, 0.4]) }
};

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;

const canvasStyle = {
    width: `${String(CANVAS_WIDTH)}px`,
    height: `${String(CANVAS_HEIGHT)}px`,
    display: 'block'
};

export const WorkerContextLoss = () => {
    const workerRef = useRef<Worker | null>(null);

    const createWorker = useCallback(() => {
        const instance = new Worker(new URL('../workers/contextLossWorker.ts', import.meta.url), {
            type: 'module'
        });
        workerRef.current = instance;
        return instance;
    }, []);

    useEffect(() => {
        const post = (message: ContextLossMessage) => {
            workerRef.current?.postMessage(message);
        };

        window.__workerContextLoss = {
            loseContext: () => { post({ type: 'demo:losecontext' }) },
            restoreContext: () => { post({ type: 'demo:restorecontext' }) }
        };
        return () => {
            window.__workerContextLoss = undefined;
        };
    }, []);

    return (
        <div style={{ padding: '16px' }}>
            <figure id='worker-host' style={{ margin: 0 }}>
                <figcaption>worker (module worker via createWorker)</figcaption>
                <BaseShaderComponent
                    worker
                    createWorker={createWorker}
                    programId='worker-context-loss'
                    shaderConfig={config}
                    uniforms={uniforms}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    useDevicePixelRatio={false}
                    reducedMotion='ignore'
                    saveData='ignore'
                    style={canvasStyle}
                />
            </figure>
        </div>
    );
};
