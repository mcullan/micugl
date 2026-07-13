import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import type { MotionGate } from '@/react/lib/motionPolicy';
import type { RenderLoop } from '@/react/lib/renderLoop';
import { frameToMs } from '@/react/lib/timeKeeper';
import type { WorkerProgramUniforms } from '@/react/lib/workerMode';
import {
    collectWorkerValues,
    resolveWorkerMode,
    transferCanvasToWorker,
    warnWorkerDevtoolsUnavailable,
    workerModeSupported
} from '@/react/lib/workerMode';
import type { Frameloop, WorkerMode } from '@/types';
import {
    createMicuglWorker,
    inlineWorkerNeverStartedMessage,
    logWorkerIssue,
    overrideWorkerCrashedMessage,
    overrideWorkerNeverStartedMessage,
    workerCrashedMessage
} from '@/worker/createWorker';
import type { WorkerBridgeInit } from '@/worker/WorkerBridge';
import { WorkerBridge, workerTransport } from '@/worker/WorkerBridge';

export type WorkerBridgeInitPayload = Omit<WorkerBridgeInit, 'canvas'>;

export interface WorkerRenderSize {
    renderWidth: number;
    renderHeight: number;
}

export interface UseWorkerBridgeOptions {
    worker: WorkerMode | undefined;
    blocked: boolean;
    contentKey: string;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    controllerRef: RefObject<RenderLoop | null>;
    bridgeRef: RefObject<WorkerBridge | null>;
    createWorker?: () => Worker;
    programs: WorkerProgramUniforms | undefined;
    debug: boolean;
    frameloop: Frameloop;
    speed: number;
    motionGate: MotionGate;
    staticFrame: number;
    measure: () => WorkerRenderSize;
    buildInit: (active: boolean) => WorkerBridgeInitPayload;
    onConnected?: () => void;
}

export interface WorkerBridgeSession {
    active: boolean;
    canvasKey: string;
    error: Error | null;
    syncActive: () => void;
    setStopped: (stopped: boolean) => void;
    isStopped: () => boolean;
}

export function useWorkerBridge(options: UseWorkerBridgeOptions): WorkerBridgeSession {
    const { worker, blocked, contentKey, debug, frameloop, speed, motionGate, staticFrame, bridgeRef } = options;

    const [fallback, setFallback] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const stoppedRef = useRef(false);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const active = !fallback && resolveWorkerMode(worker, workerModeSupported(), blocked);
    const canvasKey = active ? `worker:${contentKey}` : 'main';

    const syncActive = useCallback(() => {
        const current = optionsRef.current;
        const visible = current.controllerRef.current?.isVisible() ?? true;
        current.bridgeRef.current?.setActive(!stoppedRef.current && visible);
    }, []);

    const setStopped = useCallback((stopped: boolean) => {
        stoppedRef.current = stopped;
        syncActive();
    }, [syncActive]);

    const isStopped = useCallback(() => stoppedRef.current, []);

    useEffect(() => {
        if (!active) return;

        const canvas = optionsRef.current.canvasRef.current;
        if (!canvas) return;

        let cancelled = false;
        let created: Worker | null = null;
        let ready = false;

        const onWorkerError = (event: Event): void => {
            if (cancelled) return;

            const override = optionsRef.current.createWorker !== undefined;
            const thrown = event instanceof ErrorEvent ? event.message : '';

            if (thrown === '' && !ready) {
                logWorkerIssue(override
                    ? overrideWorkerNeverStartedMessage()
                    : inlineWorkerNeverStartedMessage());
                setFallback(true);
                return;
            }

            const detail = thrown === '' ? 'no detail given' : thrown;
            setError(new Error(override
                ? overrideWorkerCrashedMessage(detail)
                : workerCrashedMessage(detail)));
        };

        const connect = async (): Promise<void> => {
            const instance = await createMicuglWorker({ createWorker: optionsRef.current.createWorker });

            if (cancelled) {
                instance?.terminate();
                return;
            }
            if (!instance) {
                setFallback(true);
                return;
            }

            created = instance;
            instance.addEventListener('error', onWorkerError);

            const current = optionsRef.current;

            const { renderWidth, renderHeight } = current.measure();
            if (renderWidth > 0 && renderHeight > 0) {
                canvas.width = renderWidth;
                canvas.height = renderHeight;
            }

            const isActive = !stoppedRef.current && (current.controllerRef.current?.isVisible() ?? true);
            const init = current.buildInit(isActive);
            const offscreen = transferCanvasToWorker(canvas);

            const bridge = new WorkerBridge(
                workerTransport(instance),
                { ...init, canvas: offscreen },
                {
                    onReady: () => { ready = true },
                    onError: message => { setError(new Error(message)) }
                }
            );
            current.bridgeRef.current = bridge;

            bridge.setMotionGate(current.motionGate);

            current.onConnected?.();

            if (current.motionGate === 'static') {
                bridge.renderFrame(frameToMs(current.staticFrame));
            }
        };

        void connect().catch((cause: unknown) => {
            created?.terminate();
            setError(cause instanceof Error ? cause : new Error(String(cause)));
        });

        return () => {
            cancelled = true;
            created?.removeEventListener('error', onWorkerError);
            const current = optionsRef.current;
            const bridge = current.bridgeRef.current;
            current.bridgeRef.current = null;
            current.controllerRef.current?.stop();
            bridge?.dispose();
        };
    }, [active, contentKey]);

    useEffect(() => {
        const { bridgeRef: bridges, programs } = optionsRef.current;
        const bridge = bridges.current;
        if (!bridge || !programs) return;

        for (const [programId, params] of Object.entries(programs)) {
            bridge.setUniformValues(programId, collectWorkerValues(params));
        }
    });

    useEffect(() => {
        bridgeRef.current?.setFrameloop(frameloop);
        bridgeRef.current?.setSpeed(speed);
    }, [frameloop, speed, bridgeRef]);

    useEffect(() => {
        const bridge = bridgeRef.current;
        if (!bridge) return;

        bridge.setMotionGate(motionGate);
        if (motionGate === 'static') {
            bridge.renderFrame(frameToMs(staticFrame));
        }
    }, [motionGate, staticFrame, bridgeRef]);

    useEffect(() => {
        if (!debug) return;

        if (active) {
            warnWorkerDevtoolsUnavailable();
            return;
        }

        let cancelled = false;
        void import('@/react/devtools/attach').then(module => {
            if (!cancelled) {
                module.ensureDevtoolsMounted();
            }
        });
        return () => { cancelled = true };
    }, [debug, active]);

    return { active, canvasKey, error, syncActive, setStopped, isStopped };
}
