import { useCallback, useEffect, useRef, useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { vec3 } from '../../src/core/lib/vectorUtils';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { ShaderHandle, UniformParam } from '../../src/types';
import { getIntQuery, getQueryString } from './query';
import { QUAD_VERTEX, WORKER_BARS_FRAGMENT } from './shaders';

export type WorkerDemoColor = 'green' | 'red';

export interface WorkerDemoHandles {
    startAll: () => void;
    stopAll: () => void;
    blockMainThread: (ms: number) => number;
    setColor: (color: WorkerDemoColor) => void;
}

declare global {
    interface Window {
        __workerDemo?: WorkerDemoHandles;
    }
}

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WORKER_BARS_FRAGMENT,
    uniformNames: {
        u_color: 'vec3'
    }
});

const COLORS: Record<WorkerDemoColor, [number, number, number]> = {
    green: [0.15, 1, 0.4],
    red: [1, 0.2, 0.15]
};

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;

const canvasStyle = {
    width: `${String(CANVAS_WIDTH)}px`,
    height: `${String(CANVAS_HEIGHT)}px`,
    display: 'block'
};

const blockMainThread = (ms: number): number => {
    const until = performance.now() + ms;
    let spins = 0;
    while (performance.now() < until) {
        spins += 1;
    }
    return spins;
};

export const WorkerJank = () => {
    const mode = getQueryString('mode') ?? 'both';
    const blockMs = getIntQuery('blockMs', 500);
    const [color, setColor] = useState<WorkerDemoColor>('green');

    const workerHandleRef = useRef<ShaderHandle>(null);
    const mainHandleRef = useRef<ShaderHandle>(null);

    const showWorker = mode !== 'main';
    const showMain = mode !== 'worker';

    useEffect(() => {
        window.__workerDemo = {
            startAll: () => {
                workerHandleRef.current?.start();
                mainHandleRef.current?.start();
            },
            stopAll: () => {
                workerHandleRef.current?.stop();
                mainHandleRef.current?.stop();
            },
            blockMainThread,
            setColor
        };
        return () => {
            window.__workerDemo = undefined;
        };
    }, []);

    const onBlock = useCallback(() => {
        blockMainThread(blockMs);
    }, [blockMs]);

    const onToggleColor = useCallback(() => {
        setColor(current => current === 'green' ? 'red' : 'green');
    }, []);

    const uniforms: Record<string, UniformParam> = {
        u_color: { type: 'vec3', value: vec3(COLORS[color]) }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button type='button' id='block-main-thread' onClick={onBlock}>
                    Block the main thread for {blockMs}ms
                </button>
                <button type='button' id='toggle-color' onClick={onToggleColor}>
                    Toggle color (now: {color})
                </button>
            </div>

            <div style={{ display: 'flex', gap: '24px' }}>
                {showWorker && (
                    <figure id='worker-host' style={{ margin: 0 }}>
                        <figcaption>worker</figcaption>
                        <BaseShaderComponent
                            ref={workerHandleRef}
                            worker
                            programId='worker-bars'
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
                )}

                {showMain && (
                    <figure id='main-host' style={{ margin: 0 }}>
                        <figcaption>main thread</figcaption>
                        <BaseShaderComponent
                            ref={mainHandleRef}
                            programId='main-bars'
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
                )}
            </div>
        </div>
    );
};
