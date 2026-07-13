import {
    type CSSProperties,
    forwardRef,
    memo,
    type RefObject,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState
} from 'react';

import type {
    RenderOptions,
    ShaderProgramConfig,
    ShaderRenderCallback,
    UniformType,
    UniformUpdateFn
} from '@/core';
import { captureFrame } from '@/core/lib/captureFrame';
import { resolveExportDimensions, validateRenderToBlobOptions } from '@/core/lib/captureOptions';
import type { FrameInvalidation, InvalidationKind } from '@/core/lib/frameInvalidation';
import { InstanceUploader } from '@/core/lib/instanceBuffers';
import { WebGLManager } from '@/core/managers/WebGLManager';
import type { EngineDebugState, EngineHandle } from '@/react/devtools/beacon';
import { emitEngineMount, emitEngineUnmount } from '@/react/devtools/beacon';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { WorkerBridgeInitPayload } from '@/react/hooks/useWorkerBridge';
import { useWorkerBridge } from '@/react/hooks/useWorkerBridge';
import { pixelsToBlob, pixelsToDataURL } from '@/react/lib/captureBlob';
import type { CapturesAreNonReproducible } from '@/react/lib/captureLiveness';
import { nonReproducibleCaptureMessage } from '@/react/lib/captureLiveness';
import { instancingContentKey, programConfigContentKey, singleProgramEntry } from '@/react/lib/contentKeys';
import { createDelegatingInstancingConfig } from '@/react/lib/instancingConfig';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import { createRecording } from '@/react/lib/record';
import { RenderLoop } from '@/react/lib/renderLoop';
import { runRenderSequence } from '@/react/lib/renderSequence';
import {
    DEFAULT_DPR,
    DEFAULT_MAX_PIXEL_COUNT,
    resolveDeviceResolution,
    resolveResolution
} from '@/react/lib/resolution';
import { frameToMs } from '@/react/lib/timeKeeper';
import type { WorkerBlock, WorkerProgramUniforms } from '@/react/lib/workerMode';
import {
    findWorkerBlock,
    isWorkerRequested,
    normalizeLiveUniformNames,
    normalizeWorkerPrograms,
    sampleLiveUniforms,
    workerBlockMessage,
    workerGetFrameMessage,
    workerHandleUnsupportedMessage
} from '@/react/lib/workerMode';
import type {
    Dpr,
    InstancingConfig,
    RecordOptions,
    RenderControlProps,
    RenderToBlobOptions,
    SequenceOptions,
    ShaderHandle,
    WorkerMode
} from '@/types';
import type { WorkerBridge } from '@/worker/WorkerBridge';

interface UniformUpdaterEntry {
    name: string;
    type: UniformType;
    updateFn: UniformUpdateFn<UniformType>;
}

interface ShaderEngineBaseProps extends Omit<RenderControlProps, 'worker' | 'createWorker'> {
    programConfigs: Record<string, ShaderProgramConfig>;
    renderCallback: ShaderRenderCallback;
    renderOptions?: RenderOptions;
    className?: string;
    style?: CSSProperties;
    uniformUpdaters?: Record<string, UniformUpdaterEntry[]>;
    useFastPath?: boolean;
    instancing?: InstancingConfig;
    debug?: boolean;
    debugPortRef?: RefObject<UniformDebugPort | null>;
    workerSkipDefaultUniforms?: boolean;
    invalidation?: FrameInvalidation;
    capturesAreNonReproducible?: CapturesAreNonReproducible;
}

export type ShaderEngineWorkerProps =
    | { worker?: false; createWorker?: never; workerUniforms?: never; liveUniforms?: never }
    | {
        worker: WorkerMode;
        createWorker?: () => Worker;
        workerUniforms: WorkerProgramUniforms;
        liveUniforms?: string[];
        instancing?: never;
    };

type ShaderEngineProps = ShaderEngineBaseProps & ShaderEngineWorkerProps;

interface ObservedSize {
    cssWidth: number;
    cssHeight: number;
    deviceWidth?: number;
    deviceHeight?: number;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {};
const DEFAULT_CLASS_NAME = '';
const DEFAULT_STYLE: CSSProperties = {};
const DEFAULT_UNIFORM_UPDATERS: Record<string, UniformUpdaterEntry[]> = {};

const LIVE_NAME_SEPARATOR = '\u0001';

const scheduleFrame = (callback: (now: number) => void): number =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : 0;

const cancelFrame = (handle: number): void => {
    if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
    }
};

const readNow = (): number => (typeof performance === 'object' ? performance.now() : 0);

const readDevicePixelRatio = (): number =>
    typeof window === 'object' ? window.devicePixelRatio : 1;

const deny = (method: string) => (): never => {
    throw new Error(workerHandleUnsupportedMessage('ShaderEngine', method));
};

let engineIdCounter = 0;

const createEngineId = (): string => {
    if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    engineIdCounter += 1;
    return `shader-${engineIdCounter}`;
};

const emptyDebugState = (id: string): EngineDebugState => ({
    kind: 'shader',
    id,
    canvas: { renderWidth: 0, renderHeight: 0, displayWidth: 0, displayHeight: 0 },
    programIds: [],
    framebufferIds: [],
    capabilities: {
        floatRenderable: false,
        halfFloatRenderable: false,
        floatLinearFilterable: false,
        halfFloatLinearFilterable: false,
        halfFloatType: 0
    },
    floatFilterDowngraded: false
});

const ShaderEngineComponent = forwardRef<ShaderHandle, ShaderEngineProps>(({
    programConfigs,
    renderCallback,
    renderOptions = DEFAULT_RENDER_OPTIONS,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    width,
    height,
    uniformUpdaters = DEFAULT_UNIFORM_UPDATERS,
    useFastPath = false,
    instancing,
    debug = false,
    debugPortRef,
    workerUniforms,
    workerSkipDefaultUniforms = false,
    liveUniforms,
    invalidation,
    capturesAreNonReproducible,
    worker,
    createWorker,
    useDevicePixelRatio,
    pixelRatio,
    frameloop = 'always',
    speed = 1,
    pauseWhenHidden = true,
    dpr = DEFAULT_DPR,
    maxPixelCount = DEFAULT_MAX_PIXEL_COUNT,
    fit = 'window',
    reducedMotion,
    saveData,
    staticFrame = 0
}, ref) => {
    const motionGate = useMotionGate(reducedMotion, saveData);

    const [keyProgramId, keyProgramConfig] = singleProgramEntry(programConfigs);
    const contentKey = `${programConfigContentKey(keyProgramId, keyProgramConfig)}|${instancingContentKey(instancing)}`;

    const engineIdRef = useRef<string>('');
    if (!engineIdRef.current) {
        engineIdRef.current = createEngineId();
    }

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<WebGLManager | null>(null);
    const activeProgram = useRef<string | null>(null);
    const readyRef = useRef(false);
    const controllerRef = useRef<RenderLoop | null>(null);
    const observedSizeRef = useRef<ObservedSize | null>(null);
    const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const instanceUploaderRef = useRef<InstanceUploader | null>(null);
    const instancingRef = useRef(instancing);
    const bridgeRef = useRef<WorkerBridge | null>(null);
    const renderSizeRef = useRef({ renderWidth: 0, renderHeight: 0 });
    const workerActiveRef = useRef(false);
    const samplingRef = useRef(false);

    const [epoch, setEpoch] = useState(0);

    const workerRequested = isWorkerRequested(worker);
    const liveNames = workerRequested ? normalizeLiveUniformNames(liveUniforms) : [];
    const liveKey = liveNames.join(LIVE_NAME_SEPARATOR);
    const workerPrograms = workerRequested && workerUniforms
        ? normalizeWorkerPrograms(workerUniforms)
        : undefined;
    const block: WorkerBlock | null = workerRequested
        ? findWorkerBlock({
            uniforms: workerPrograms,
            fastPath: useFastPath,
            instancing: instancing !== undefined,
            liveUniforms: { programId: keyProgramId, names: liveNames }
        })
        : null;

    const liveRef = useRef({ programId: keyProgramId, programs: workerPrograms, names: liveNames });
    liveRef.current = { programId: keyProgramId, programs: workerPrograms, names: liveNames };

    const initPropsRef = useRef({ programConfigs, uniformUpdaters, instancing });
    const renderConfigRef = useRef({ useFastPath, renderOptions, renderCallback });

    const dprMin = Array.isArray(dpr) ? dpr[0] : dpr;
    const dprMax = Array.isArray(dpr) ? dpr[1] : dpr;

    const drawFastPathGeometry = useCallback((gl: WebGLRenderingContext, manager: WebGLManager) => {
        const uploader = instanceUploaderRef.current;
        if (uploader) {
            const count = uploader.upload();
            if (count > 0) {
                manager.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
            }
            return;
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }, []);

    const renderFrame = useCallback((elapsed: number) => {
        if (!readyRef.current) return;

        const manager = managerRef.current;
        const programId = activeProgram.current;
        if (!manager || !programId) return;

        const gl = manager.context;
        const { useFastPath: fast, renderOptions: options, renderCallback: callback } = renderConfigRef.current;

        if (fast) {
            manager.fastRender(programId, elapsed, options.clear);
            drawFastPathGeometry(gl, manager);
        } else {
            const resources = manager.resources.get(programId);
            if (!resources) return;

            manager.prepareRender(programId, options);
            callback(elapsed, resources, gl);
        }
    }, [drawFastPathGeometry]);

    const captureStill = useCallback((options: RenderToBlobOptions | undefined) => {
        const opts = options ?? {};

        if (opts.seed !== undefined || opts.steps !== undefined) {
            throw new Error('ShaderEngine.renderToBlob: no simulation to seed');
        }
        validateRenderToBlobOptions(opts);

        const manager = managerRef.current;
        if (!readyRef.current || !manager) {
            throw new Error('ShaderEngine.renderToBlob: engine is not ready');
        }
        if (manager.context.isContextLost()) {
            throw new Error('ShaderEngine.renderToBlob: WebGL context is lost');
        }

        const explicitFrame = opts.frame !== undefined;
        const blocker = explicitFrame ? capturesAreNonReproducible?.() : null;
        if (blocker) {
            throw new Error(nonReproducibleCaptureMessage('ShaderEngine', 'renderToBlob', blocker));
        }

        const canvas = manager.context.canvas as HTMLCanvasElement;
        const backingWidth = canvas.width;
        const backingHeight = canvas.height;

        const { width, height } = resolveExportDimensions(opts, backingWidth, backingHeight);
        const isDefaultDims = width === backingWidth && height === backingHeight;
        const timeMs = frameToMs(opts.frame ?? controllerRef.current?.getFrame() ?? 0);

        const result = captureFrame(
            {
                manager,
                renderDefault: timeMsArg => { renderFrame(timeMsArg) },
                renderAtSize: (timeMsArg, w, h) => {
                    const { useFastPath: fast, renderOptions: renderOpts } = renderConfigRef.current;
                    const programId = activeProgram.current;
                    if (!fast || !programId) {
                        throw new Error('ShaderEngine.renderToBlob: custom-resolution export requires useFastPath');
                    }
                    manager.fastRender(programId, timeMsArg, renderOpts.clear, w, h);
                    drawFastPathGeometry(manager.context, manager);
                },
                restoreDisplay: () => {
                    if (isDefaultDims && explicitFrame) {
                        renderFrame(frameToMs(controllerRef.current?.getFrame() ?? 0));
                    }
                }
            },
            timeMs,
            width,
            height,
            backingWidth,
            backingHeight
        );

        return { ...result, type: opts.type, quality: opts.quality };
    }, [renderFrame, drawFastPathGeometry, capturesAreNonReproducible]);

    const commitSize = useCallback((
        resolution: { renderWidth: number; renderHeight: number },
        display?: { displayWidth: number; displayHeight: number }
    ) => {
        renderSizeRef.current = {
            renderWidth: resolution.renderWidth,
            renderHeight: resolution.renderHeight
        };

        if (workerActiveRef.current) {
            const canvas = canvasRef.current;
            if (canvas && display) {
                canvas.style.width = `${display.displayWidth}px`;
                canvas.style.height = `${display.displayHeight}px`;
            }
            bridgeRef.current?.resize(resolution.renderWidth, resolution.renderHeight);
        } else {
            const manager = managerRef.current;
            if (!manager) return;

            if (display) {
                manager.setSize(
                    resolution.renderWidth,
                    resolution.renderHeight,
                    display.displayWidth,
                    display.displayHeight
                );
            } else {
                manager.setDrawingBufferSize(resolution.renderWidth, resolution.renderHeight);
            }
        }

        controllerRef.current?.invalidate();
    }, []);

    const applySize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!workerActiveRef.current && (!readyRef.current || !managerRef.current)) return;

        const devicePixelRatio = readDevicePixelRatio();
        const disableDevicePixelRatio = useDevicePixelRatio === false;
        const resolvedDpr: Dpr = [dprMin, dprMax];

        if (fit === 'element') {
            const observed = observedSizeRef.current;
            const hasFixed = width !== undefined || height !== undefined;

            if (!hasFixed && observed?.deviceWidth !== undefined && observed.deviceHeight !== undefined) {
                commitSize(resolveDeviceResolution({
                    deviceWidth: observed.deviceWidth,
                    deviceHeight: observed.deviceHeight,
                    devicePixelRatio,
                    dpr: resolvedDpr,
                    maxPixelCount,
                    pixelRatioOverride: pixelRatio,
                    disableDevicePixelRatio
                }));
                return;
            }

            const cssWidth = width ?? observed?.cssWidth ?? canvas.clientWidth;
            const cssHeight = height ?? observed?.cssHeight ?? canvas.clientHeight;
            commitSize(resolveResolution({
                displayWidth: cssWidth,
                displayHeight: cssHeight,
                devicePixelRatio,
                dpr: resolvedDpr,
                maxPixelCount,
                pixelRatioOverride: pixelRatio,
                disableDevicePixelRatio
            }));
            return;
        }

        const displayWidth = width ?? (typeof window === 'object' ? window.innerWidth : 0);
        const displayHeight = height ?? (typeof window === 'object' ? window.innerHeight : 0);
        commitSize(
            resolveResolution({
                displayWidth,
                displayHeight,
                devicePixelRatio,
                dpr: resolvedDpr,
                maxPixelCount,
                pixelRatioOverride: pixelRatio,
                disableDevicePixelRatio
            }),
            { displayWidth, displayHeight }
        );
    }, [width, height, dprMin, dprMax, maxPixelCount, pixelRatio, useDevicePixelRatio, fit, commitSize]);

    const applySizeRef = useRef(applySize);

    const postLiveUniforms = useCallback((elapsed: number) => {
        const bridge = bridgeRef.current;
        const { programs, programId, names } = liveRef.current;
        if (!bridge || !programs || names.length === 0 || samplingRef.current) return;

        const { renderWidth, renderHeight } = renderSizeRef.current;
        samplingRef.current = true;
        try {
            bridge.setUniformValues(
                programId,
                sampleLiveUniforms(names, programs[programId], elapsed, renderWidth, renderHeight)
            );
        } finally {
            samplingRef.current = false;
        }
    }, []);

    const driveFrame = useCallback((elapsed: number) => {
        if (workerActiveRef.current) {
            postLiveUniforms(elapsed);
            return;
        }
        renderFrame(elapsed);
    }, [postLiveUniforms, renderFrame]);

    const invalidateAll = useCallback((kind: InvalidationKind = 'discrete') => {
        if (workerActiveRef.current) {
            postLiveUniforms(frameToMs(controllerRef.current?.getFrame() ?? 0));
            controllerRef.current?.invalidate(kind);
            bridgeRef.current?.invalidate(undefined, kind);
            return;
        }
        controllerRef.current?.invalidate(kind);
    }, [postLiveUniforms]);

    const startSamplerLoop = useCallback(() => {
        if (liveRef.current.names.length === 0) return;
        controllerRef.current?.start();
    }, []);

    const session = useWorkerBridge({
        worker,
        blocked: block !== null,
        contentKey,
        canvasRef,
        controllerRef,
        bridgeRef,
        createWorker,
        programs: workerPrograms,
        debug,
        frameloop,
        speed,
        motionGate,
        staticFrame,
        measure: () => {
            applySizeRef.current();
            return renderSizeRef.current;
        },
        buildInit: (active): WorkerBridgeInitPayload => {
            if (!workerPrograms) {
                throw new Error(workerBlockMessage('ShaderEngine', { kind: 'uniforms-missing' }));
            }
            return {
                kind: 'single',
                programConfigs,
                uniforms: workerPrograms,
                skipDefaultUniforms: workerSkipDefaultUniforms,
                frameloop,
                speed,
                active,
                renderOptions: { clear: renderOptions.clear },
                liveUniforms: liveNames.length > 0 ? { [keyProgramId]: liveNames } : undefined
            };
        },
        onConnected: () => {
            postLiveUniforms(frameToMs(controllerRef.current?.getFrame() ?? 0));
            startSamplerLoop();
        }
    });

    const { active: workerActive, canvasKey, syncActive, setStopped, isStopped } = session;
    workerActiveRef.current = workerActive;

    useEffect(() => {
        initPropsRef.current = { programConfigs, uniformUpdaters, instancing };
        renderConfigRef.current = { useFastPath, renderOptions, renderCallback };
        instancingRef.current = instancing;
        applySizeRef.current = applySize;
    });

    useEffect(() => {
        const controller = new RenderLoop({
            requestAnimationFrame: scheduleFrame,
            cancelAnimationFrame: cancelFrame,
            now: readNow,
            render: driveFrame
        });
        controllerRef.current = controller;
        return () => {
            controller.stop();
            controllerRef.current = null;
        };
    }, [driveFrame]);

    useEffect(() => {
        if (!workerActive || liveKey.length === 0 || isStopped()) return;

        const controller = controllerRef.current;
        controller?.start();
        return () => { controller?.stop() };
    }, [workerActive, liveKey, isStopped]);

    useEffect(() => {
        if (!invalidation) return;
        return invalidation.connect(invalidateAll);
    }, [invalidation, invalidateAll]);

    useEffect(() => {
        if (workerActive) return;
        if (!canvasRef.current) return;

        const manager = new WebGLManager(canvasRef.current);
        managerRef.current = manager;

        try {
            if (!manager.context.isContextLost()) {
                const [pid, cfg] = singleProgramEntry(initPropsRef.current.programConfigs);
                manager.createProgram(pid, cfg);
                manager.createBuffer(pid, 'a_position', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
                manager.setAttributeOnce(pid, 'a_position', {
                    name: 'a_position', size: 2, type: 'FLOAT',
                    normalized: false, stride: 0, offset: 0
                });
                activeProgram.current = pid;

                const instancingConfig = initPropsRef.current.instancing;
                if (instancingConfig) {
                    if (!renderConfigRef.current.useFastPath) {
                        throw new Error('ShaderEngine: instancing requires useFastPath');
                    }

                    const instancedAttributeConfigs = new Map(
                        (cfg.attributes ?? [])
                            .filter(attribute => attribute.instanced)
                            .map(attribute => [attribute.name, attribute] as const)
                    );

                    const instancingAttributeConfigs = Object.keys(instancingConfig.attributes).map(name => {
                        const attributeConfig = instancedAttributeConfigs.get(name);
                        if (!attributeConfig) {
                            throw new Error(
                                `ShaderEngine: instancing attribute "${name}" must be declared with instanced: true in the program's attributeConfigs`
                            );
                        }
                        return [name, attributeConfig] as const;
                    });

                    const delegatingConfig = createDelegatingInstancingConfig(instancingConfig, () => {
                        const latest = instancingRef.current;
                        if (!latest) {
                            throw new Error('ShaderEngine: instancing prop was removed while active');
                        }
                        return latest;
                    });

                    const uploader = new InstanceUploader(manager, pid, delegatingConfig);
                    uploader.initialize();

                    for (const [name, attributeConfig] of instancingAttributeConfigs) {
                        manager.setAttributeOnce(pid, name, attributeConfig);
                    }

                    instanceUploaderRef.current = uploader;
                }

                const ups = initPropsRef.current.uniformUpdaters[pid] as UniformUpdaterEntry[] | undefined;
                ups?.forEach(u => {
                    manager.registerUniformUpdater(pid, u.name, u.type, u.updateFn);
                });

                readyRef.current = true;
                applySizeRef.current();
                controllerRef.current?.start();

                const managerWeak = new WeakRef(manager);
                const engineId = engineIdRef.current;
                let lastKnownState: EngineDebugState | null = null;

                const handle: EngineHandle = {
                    id: engineId,
                    kind: 'shader',
                    getManager: () => managerWeak.deref() ?? null,
                    getState: () => {
                        const currentManager = managerWeak.deref();
                        if (!currentManager) {
                            return lastKnownState ?? emptyDebugState(engineId);
                        }
                        try {
                            const glCanvas = currentManager.context.canvas as HTMLCanvasElement;
                            const state: EngineDebugState = {
                                kind: 'shader',
                                id: engineId,
                                canvas: {
                                    renderWidth: glCanvas.width,
                                    renderHeight: glCanvas.height,
                                    displayWidth: glCanvas.clientWidth,
                                    displayHeight: glCanvas.clientHeight
                                },
                                programIds: Array.from(currentManager.resources.keys()),
                                framebufferIds: currentManager.fbo.getFramebufferIds(),
                                capabilities: currentManager.fbo.getCapabilities(),
                                floatFilterDowngraded: currentManager.fbo.wasFloatFilterDowngraded(),
                                frameloop: controllerRef.current?.getFrameloop(),
                                paused: controllerRef.current?.isPaused(),
                                speed: controllerRef.current?.getSpeed()
                            };
                            lastKnownState = state;
                            return state;
                        } catch {
                            return lastKnownState ?? emptyDebugState(engineId);
                        }
                    },
                    invalidate: () => { controllerRef.current?.invalidate() },
                    setFrame: (frame: number) => { controllerRef.current?.setFrame(frame) },
                    getFrame: () => controllerRef.current?.getFrame() ?? 0,
                    setFrameloop: mode => { controllerRef.current?.setFrameloop(mode) },
                    uniforms: debugPortRef?.current ?? undefined
                };
                emitEngineMount(handle);
            }
        } catch (error) {
            manager.destroyAll();
            throw error;
        }

        return () => {
            readyRef.current = false;
            controllerRef.current?.stop();
            manager.destroyAll();
            activeProgram.current = null;
            instanceUploaderRef.current = null;
            emitEngineUnmount(engineIdRef.current);
        };
    }, [workerActive, contentKey, epoch, debugPortRef]);

    useEffect(() => {
        applySize();

        if (width !== undefined && height !== undefined) {
            return;
        }

        const canvas = canvasRef.current;

        if (fit === 'element') {
            if (!canvas || typeof ResizeObserver !== 'function') {
                return;
            }
            const observer = new ResizeObserver(entries => {
                const entry = entries[entries.length - 1] as ResizeObserverEntry | undefined;
                if (!entry) return;

                const boxes = entry.devicePixelContentBoxSize as readonly ResizeObserverSize[] | undefined;
                const deviceBox = boxes?.[0];
                observedSizeRef.current = {
                    cssWidth: entry.contentRect.width,
                    cssHeight: entry.contentRect.height,
                    deviceWidth: deviceBox?.inlineSize,
                    deviceHeight: deviceBox?.blockSize
                };
                applySize();
            });
            observer.observe(canvas);
            return () => { observer.disconnect() };
        }

        if (typeof window !== 'object') {
            return;
        }
        const onResize = () => { applySize() };
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize) };
    }, [fit, width, height, canvasKey, applySize]);

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;

        const setVisible = (documentVisible: boolean) => {
            controller.setVisible(documentVisible);
            syncActive();
        };
        const setIntersecting = (intersecting: boolean) => {
            controller.setIntersecting(intersecting);
            syncActive();
        };

        const onVisibility = () => {
            setVisible(typeof document === 'object' ? !document.hidden : true);
        };

        if (typeof document === 'object') {
            setVisible(!document.hidden);
            document.addEventListener('visibilitychange', onVisibility);
        }

        let observer: IntersectionObserver | null = null;
        const canvas = canvasRef.current;
        if (canvas && typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver(entries => {
                const entry = entries[entries.length - 1] as IntersectionObserverEntry | undefined;
                if (entry) {
                    setIntersecting(entry.isIntersecting);
                }
            }, { threshold: 0 });
            observer.observe(canvas);
        } else {
            setIntersecting(true);
        }

        return () => {
            if (typeof document === 'object') {
                document.removeEventListener('visibilitychange', onVisibility);
            }
            observer?.disconnect();
        };
    }, [canvasKey, syncActive]);

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;

        controller.setFrameloop(frameloop);
        controller.setSpeed(speed);
        controller.setPauseWhenHidden(pauseWhenHidden);
        syncActive();
    }, [frameloop, speed, pauseWhenHidden, syncActive]);

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;

        controller.setMotionGate(motionGate);
        if (motionGate === 'static') {
            controller.pinFrame(staticFrame);
        }
    }, [motionGate, staticFrame]);

    useEffect(() => {
        if (workerActive) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const onLost = (event: Event) => {
            event.preventDefault();
            readyRef.current = false;
            controllerRef.current?.stop();
        };
        const onRestored = () => {
            setEpoch(value => value + 1);
        };

        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        return () => {
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
        };
    }, [workerActive, canvasKey]);

    useEffect(() => {
        if (releaseTimerRef.current !== null) {
            clearTimeout(releaseTimerRef.current);
            releaseTimerRef.current = null;
        }
        return () => {
            const manager = managerRef.current;
            releaseTimerRef.current = setTimeout(() => {
                manager?.loseContext();
                managerRef.current = null;
                releaseTimerRef.current = null;
            }, 0);
        };
    }, []);

    useImperativeHandle(ref, (): ShaderHandle => workerActive ? {
        invalidate: invalidateAll,
        setFrame: (frame: number) => {
            controllerRef.current?.setFrame(frame);
            bridgeRef.current?.renderFrame(frameToMs(frame));
        },
        getFrame: () => { throw new Error(workerGetFrameMessage('ShaderEngine')) },
        start: () => {
            setStopped(false);
            startSamplerLoop();
        },
        stop: () => {
            setStopped(true);
            controllerRef.current?.stop();
        },
        renderToBlob: deny('renderToBlob'),
        renderToDataURL: deny('renderToDataURL'),
        captureStream: deny('captureStream'),
        record: deny('record'),
        renderSequence: deny('renderSequence')
    } : {
        invalidate: invalidateAll,
        setFrame: (frame: number) => { controllerRef.current?.setFrame(frame) },
        getFrame: () => controllerRef.current?.getFrame() ?? 0,
        start: () => { controllerRef.current?.start() },
        stop: () => { controllerRef.current?.stop() },
        renderToBlob: async (options?: RenderToBlobOptions) => {
            const { pixels, width, height, type, quality } = captureStill(options);
            return pixelsToBlob(pixels, width, height, type, quality);
        },
        renderToDataURL: (options?: RenderToBlobOptions) => {
            const { pixels, width, height, type, quality } = captureStill(options);
            return Promise.resolve(pixelsToDataURL(pixels, width, height, type, quality));
        },
        captureStream: (fps?: number) => {
            const manager = managerRef.current;
            if (!readyRef.current || !manager) {
                throw new Error('ShaderEngine.captureStream: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('ShaderEngine.captureStream: WebGL context is lost');
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            if (typeof canvas.captureStream !== 'function') {
                throw new Error('ShaderEngine.captureStream: this canvas does not support captureStream');
            }
            return canvas.captureStream(fps ?? 60);
        },
        record: (options?: RecordOptions) => {
            const manager = managerRef.current;
            if (!readyRef.current || !manager) {
                throw new Error('ShaderEngine.record: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('ShaderEngine.record: WebGL context is lost');
            }
            if (controllerRef.current?.getMotionGate() !== 'none') {
                throw new Error(
                    'ShaderEngine.record: recording a motion-gated engine captures a frozen poster; ' +
                    'set reducedMotion="ignore"/saveData="ignore", or use renderSequence() instead'
                );
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            return createRecording(canvas, options);
        },
        renderSequence: (options: SequenceOptions) => {
            const manager = managerRef.current;
            if (!readyRef.current || !manager) {
                throw new Error('ShaderEngine.renderSequence: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('ShaderEngine.renderSequence: WebGL context is lost');
            }
            if (options.seed !== undefined) {
                throw new Error('ShaderEngine.renderSequence: no simulation to seed');
            }
            const blocker = capturesAreNonReproducible?.();
            if (blocker) {
                throw new Error(nonReproducibleCaptureMessage('ShaderEngine', 'renderSequence', blocker));
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            const controller = controllerRef.current;
            const wasRunning = controller !== null && !controller.isPaused();
            if (wasRunning) {
                controller.stop();
            }
            return runRenderSequence({ canvas, renderAtMs: renderFrame }, options).finally(() => {
                renderFrame(frameToMs(controllerRef.current?.getFrame() ?? 0));
                if (wasRunning && controllerRef.current === controller) {
                    controller.start();
                }
            });
        }
    }, [
        workerActive,
        captureStill,
        renderFrame,
        invalidateAll,
        startSamplerLoop,
        setStopped,
        capturesAreNonReproducible
    ]);

    if (workerActive && block) {
        throw new Error(workerBlockMessage('ShaderEngine', block));
    }

    if (session.error) {
        throw session.error;
    }

    return (
        <canvas
            key={canvasKey}
            ref={canvasRef}
            className={className}
            style={style}
        />
    );
});

ShaderEngineComponent.displayName = 'ShaderEngine';

export const ShaderEngine = memo(ShaderEngineComponent);
