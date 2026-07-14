import {
    type CSSProperties,
    forwardRef,
    memo,
    type RefObject,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from 'react';

import type {
    FramebufferOptions,
    RenderPass,
    ShaderProgramConfig
} from '@/core';
import { CAPTURE_SCRATCH_FRAMEBUFFER_ID, captureFrame } from '@/core/lib/captureFrame';
import { resolveExportDimensions, validateRenderToBlobOptions } from '@/core/lib/captureOptions';
import type { FrameInvalidation, InvalidationKind } from '@/core/lib/frameInvalidation';
import type { FramebufferReadResult, FramebufferUnreadable } from '@/core/managers/FBOManager';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import type { EngineDebugState, EngineHandle, GraphDebugPort } from '@/react/devtools/beacon';
import { emitEngineMount, emitEngineUnmount } from '@/react/devtools/beacon';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { GraphDebugSource } from '@/react/hooks/useShaderGraph';
import type { WorkerBridgeInitPayload } from '@/react/hooks/useWorkerBridge';
import { useWorkerBridge } from '@/react/hooks/useWorkerBridge';
import { pixelsToBlob, pixelsToDataURL } from '@/react/lib/captureBlob';
import type { CapturesAreNonReproducible } from '@/react/lib/captureLiveness';
import { nonReproducibleCaptureMessage } from '@/react/lib/captureLiveness';
import { framebuffersContentKey, programConfigsContentKey, textureSourcesContentKey } from '@/react/lib/contentKeys';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import { declarePingPongSampler } from '@/react/lib/pingPongPasses';
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
    normalizeWorkerPrograms,
    stripPassUniforms,
    workerBlockMessage,
    workerGetFrameMessage,
    workerHandleUnsupportedMessage
} from '@/react/lib/workerMode';
import type {
    Dpr,
    PingPongShaderHandle,
    RecordOptions,
    RenderControlProps,
    RenderToBlobOptions,
    SeedOptions,
    SequenceOptions,
    TextureSource,
    WorkerMode
} from '@/types';
import type { WorkerBridge } from '@/worker/WorkerBridge';

interface PingPongShaderEngineBaseProps extends Omit<RenderControlProps, 'worker' | 'createWorker'> {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    textureSources?: TextureSource[];
    className?: string;
    style?: CSSProperties;
    renderWidth?: number;
    renderHeight?: number;
    debug?: boolean;
    debugPortRef?: RefObject<UniformDebugPort | null>;
    graphDebugRef?: RefObject<GraphDebugSource | null>;
    invalidation?: FrameInvalidation;
    capturesAreNonReproducible?: CapturesAreNonReproducible;
}

export type PingPongShaderEngineWorkerProps =
    | { worker?: false; createWorker?: never; workerUniforms?: never; workerCustomPasses?: never }
    | {
        worker: WorkerMode;
        createWorker?: () => Worker;
        workerUniforms: WorkerProgramUniforms;
        workerCustomPasses: boolean;
    };

type PingPongShaderEngineProps = PingPongShaderEngineBaseProps & PingPongShaderEngineWorkerProps;

interface ObservedSize {
    cssWidth: number;
    cssHeight: number;
    deviceWidth?: number;
    deviceHeight?: number;
}

const DEFAULT_CLASS_NAME = '';
const DEFAULT_STYLE: CSSProperties = {};

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
    throw new Error(workerHandleUnsupportedMessage('PingPongShaderEngine', method));
};

let engineIdCounter = 0;

const createEngineId = (): string => {
    if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    engineIdCounter += 1;
    return `pingpong-${engineIdCounter}`;
};

const emptyDebugState = (id: string): EngineDebugState => ({
    kind: 'pingpong',
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

const PingPongShaderEngineComponent = forwardRef<PingPongShaderHandle, PingPongShaderEngineProps>(({
    programConfigs,
    passes,
    framebuffers,
    textureSources,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    width,
    height,
    renderWidth,
    renderHeight,
    debug = false,
    debugPortRef,
    graphDebugRef,
    workerUniforms,
    workerCustomPasses = false,
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

    const contentKey = `${programConfigsContentKey(programConfigs)}\u0002${framebuffersContentKey(framebuffers)}`
        + `\u0002${textureSourcesContentKey(textureSources)}`;

    const engineIdRef = useRef<string>('');
    if (!engineIdRef.current) {
        engineIdRef.current = createEngineId();
    }

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<WebGLManager | null>(null);
    const passSystemRef = useRef<Passes | null>(null);
    const readyRef = useRef(false);
    const controllerRef = useRef<RenderLoop | null>(null);
    const observedSizeRef = useRef<ObservedSize | null>(null);
    const appliedPassesRef = useRef<RenderPass[] | null>(null);
    const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bridgeRef = useRef<WorkerBridge | null>(null);
    const renderSizeRef = useRef({ renderWidth: 0, renderHeight: 0 });
    const workerActiveRef = useRef(false);

    const [epoch, setEpoch] = useState(0);

    const workerRequested = isWorkerRequested(worker);
    const workerPasses = useMemo(
        () => workerRequested && !workerCustomPasses ? stripPassUniforms(passes) : passes,
        [workerRequested, workerCustomPasses, passes]
    );
    const workerPrograms = workerRequested && workerUniforms
        ? normalizeWorkerPrograms(workerUniforms)
        : undefined;
    const block: WorkerBlock | null = workerRequested
        ? findWorkerBlock({
            uniforms: workerPrograms,
            fastPath: true,
            instancing: false,
            textures: (textureSources?.length ?? 0) > 0,
            passes: workerPasses
        })
        : null;

    const initPropsRef = useRef({ programConfigs, framebuffers, passes, textureSources });

    const dprMin = Array.isArray(dpr) ? dpr[0] : dpr;
    const dprMax = Array.isArray(dpr) ? dpr[1] : dpr;

    const renderFrame = useCallback((elapsed: number) => {
        if (!readyRef.current) return;

        const manager = managerRef.current;
        const passSystem = passSystemRef.current;
        if (!manager || !passSystem) return;

        passSystem.execute(elapsed);
    }, []);

    const resetSimulation = useCallback((seed?: SeedOptions) => {
        const manager = managerRef.current;
        const passSystem = passSystemRef.current;
        if (!readyRef.current || !manager || !passSystem) {
            throw new Error('PingPongShaderEngine.resetSimulation: engine is not ready');
        }
        if (manager.context.isContextLost()) {
            throw new Error('PingPongShaderEngine.resetSimulation: WebGL context is lost');
        }

        passSystem.reset(seed?.color);
        controllerRef.current?.invalidate();
    }, []);

    const captureStill = useCallback((options: RenderToBlobOptions | undefined) => {
        const opts = options ?? {};
        validateRenderToBlobOptions(opts);

        const manager = managerRef.current;
        const passSystem = passSystemRef.current;
        if (!readyRef.current || !manager || !passSystem) {
            throw new Error('PingPongShaderEngine.renderToBlob: engine is not ready');
        }
        if (manager.context.isContextLost()) {
            throw new Error('PingPongShaderEngine.renderToBlob: WebGL context is lost');
        }

        const stepsTheClock = opts.frame !== undefined || opts.steps !== undefined;
        const blocker = stepsTheClock ? capturesAreNonReproducible?.() : null;
        if (blocker) {
            throw new Error(nonReproducibleCaptureMessage('PingPongShaderEngine', 'renderToBlob', blocker));
        }

        const timePure = passSystem.isTimePure();
        if (opts.frame !== undefined && !timePure && opts.steps === undefined) {
            throw new Error(
                'PingPongShaderEngine.renderToBlob: cannot deterministically render an explicit frame of an ' +
                'accumulating simulation; provide seed + steps, or capture the current frame without frame'
            );
        }

        const canvas = manager.context.canvas as HTMLCanvasElement;
        const backingWidth = canvas.width;
        const backingHeight = canvas.height;
        const { width, height } = resolveExportDimensions(opts, backingWidth, backingHeight);

        let timeMs: number;
        let restoreAfter = false;

        if (opts.steps !== undefined) {
            const seed = opts.seed;
            if (!seed) {
                throw new Error('PingPongShaderEngine.renderToBlob: steps requires a seed');
            }
            passSystem.reset(seed.color);
            const dtMs = 1000 / (opts.fps ?? 60);
            for (let i = 0; i < opts.steps; i++) {
                passSystem.execute(i * dtMs);
            }
            timeMs = (opts.steps - 1) * dtMs;
        } else if (opts.frame !== undefined) {
            timeMs = frameToMs(opts.frame);
            passSystem.execute(timeMs);
            restoreAfter = true;
        } else {
            timeMs = frameToMs(controllerRef.current?.getFrame() ?? 0);
            passSystem.execute(timeMs);
        }

        const result = captureFrame(
            {
                manager,
                renderDefault: () => undefined,
                renderAtSize: (timeMsArg, w, h) => {
                    passSystem.renderFinalPassTo(CAPTURE_SCRATCH_FRAMEBUFFER_ID, w, h, timeMsArg);
                },
                restoreDisplay: () => {
                    if (restoreAfter) {
                        passSystem.execute(frameToMs(controllerRef.current?.getFrame() ?? 0));
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
    }, [capturesAreNonReproducible]);

    const applySize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const workerMode = workerActiveRef.current;
        const manager = managerRef.current;
        if (!workerMode && (!readyRef.current || !manager)) return;

        const devicePixelRatio = readDevicePixelRatio();
        const disableDevicePixelRatio = useDevicePixelRatio === false;
        const resolvedDpr: Dpr = [dprMin, dprMax];
        const observed = observedSizeRef.current;

        let displayWidth: number;
        let displayHeight: number;
        if (fit === 'element') {
            displayWidth = width ?? observed?.cssWidth ?? canvas.clientWidth;
            displayHeight = height ?? observed?.cssHeight ?? canvas.clientHeight;
        } else {
            displayWidth = width ?? (typeof window === 'object' ? window.innerWidth : 0);
            displayHeight = height ?? (typeof window === 'object' ? window.innerHeight : 0);
        }

        let computedWidth: number;
        let computedHeight: number;
        if (fit === 'element' && width === undefined && height === undefined
            && observed?.deviceWidth !== undefined && observed.deviceHeight !== undefined) {
            const resolution = resolveDeviceResolution({
                deviceWidth: observed.deviceWidth,
                deviceHeight: observed.deviceHeight,
                devicePixelRatio,
                dpr: resolvedDpr,
                maxPixelCount,
                pixelRatioOverride: pixelRatio,
                disableDevicePixelRatio
            });
            computedWidth = resolution.renderWidth;
            computedHeight = resolution.renderHeight;
        } else {
            const resolution = resolveResolution({
                displayWidth,
                displayHeight,
                devicePixelRatio,
                dpr: resolvedDpr,
                maxPixelCount,
                pixelRatioOverride: pixelRatio,
                disableDevicePixelRatio
            });
            computedWidth = resolution.renderWidth;
            computedHeight = resolution.renderHeight;
        }

        const bufferWidth = renderWidth ?? computedWidth;
        const bufferHeight = renderHeight ?? computedHeight;

        if (workerMode) {
            if (fit !== 'element') {
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayHeight}px`;
            }
            renderSizeRef.current = { renderWidth: bufferWidth, renderHeight: bufferHeight };
            bridgeRef.current?.resize(bufferWidth, bufferHeight);
            return;
        }

        if (!manager) return;

        if (fit === 'element') {
            manager.setDrawingBufferSize(bufferWidth, bufferHeight);
        } else {
            manager.setSize(bufferWidth, bufferHeight, displayWidth, displayHeight);
        }

        const glCanvas = manager.context.canvas;
        Object.entries(initPropsRef.current.framebuffers ?? {}).forEach(([id, options]) => {
            const fbWidth = options.width || glCanvas.width;
            const fbHeight = options.height || glCanvas.height;
            manager.fbo.resizeFramebuffer(id, fbWidth, fbHeight);
        });

        controllerRef.current?.invalidate();
    }, [width, height, renderWidth, renderHeight, dprMin, dprMax, maxPixelCount, pixelRatio, useDevicePixelRatio, fit]);

    const applySizeRef = useRef(applySize);

    const invalidateAll = useCallback((kind: InvalidationKind = 'discrete') => {
        if (workerActiveRef.current) {
            bridgeRef.current?.invalidate(undefined, kind);
            return;
        }
        controllerRef.current?.invalidate(kind);
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
                throw new Error(workerBlockMessage('PingPongShaderEngine', { kind: 'uniforms-missing' }));
            }
            return {
                kind: 'pingpong',
                programConfigs: declarePingPongSampler(programConfigs),
                uniforms: workerPrograms,
                passes: workerPasses,
                framebuffers,
                skipDefaultUniforms: workerCustomPasses,
                frameloop,
                speed,
                active
            };
        },
        onConnected: () => {
            appliedPassesRef.current = workerPasses;
        }
    });

    const { active: workerActive, canvasKey, syncActive, setStopped } = session;
    workerActiveRef.current = workerActive;

    useEffect(() => {
        initPropsRef.current = { programConfigs, framebuffers, passes, textureSources };
        applySizeRef.current = applySize;
    });

    useEffect(() => {
        const controller = new RenderLoop({
            requestAnimationFrame: scheduleFrame,
            cancelAnimationFrame: cancelFrame,
            now: readNow,
            render: renderFrame
        });
        controllerRef.current = controller;
        return () => {
            controller.stop();
            controllerRef.current = null;
        };
    }, [renderFrame]);

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
                const {
                    programConfigs: configs,
                    framebuffers: fbs,
                    passes: initialPasses,
                    textureSources: sources
                } = initPropsRef.current;

                Object.entries(declarePingPongSampler(configs)).forEach(([id, config]) => {
                    manager.createProgram(id, config);
                });

                Object.entries(fbs ?? {}).forEach(([id, options]) => {
                    manager.fbo.createFramebuffer(id, options);
                });

                (sources ?? []).forEach(source => {
                    manager.textures.defineTexture(source);
                });

                const passSystem = new Passes(manager);
                passSystemRef.current = passSystem;

                initialPasses.forEach(pass => {
                    passSystem.addPass(pass);
                });
                appliedPassesRef.current = initialPasses;

                passSystem.initializeResources();

                readyRef.current = true;
                applySizeRef.current();
                controllerRef.current?.start();

                const managerWeak = new WeakRef(manager);
                const engineId = engineIdRef.current;
                let lastKnownState: EngineDebugState | null = null;

                const handle: EngineHandle = {
                    id: engineId,
                    kind: 'pingpong',
                    getManager: () => managerWeak.deref() ?? null,
                    getState: () => {
                        const currentManager = managerWeak.deref();
                        if (!currentManager) {
                            return lastKnownState ?? emptyDebugState(engineId);
                        }
                        try {
                            const glCanvas = currentManager.context.canvas as HTMLCanvasElement;
                            const state: EngineDebugState = {
                                kind: 'pingpong',
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
                    get uniforms() {
                        return debugPortRef?.current ?? undefined;
                    },
                    get graph(): GraphDebugPort | undefined {
                        if (!graphDebugRef?.current) {
                            return undefined;
                        }
                        return {
                            topology: () => {
                                const source = graphDebugRef.current;
                                if (!source) {
                                    throw new Error('micugl devtools: graph.topology read after the engine was torn down');
                                }
                                return source.topology();
                            },
                            nodeUniforms: nodeId => {
                                const source = graphDebugRef.current;
                                if (!source) {
                                    throw new Error('micugl devtools: graph.nodeUniforms read after the engine was torn down');
                                }
                                return source.nodeUniforms(nodeId);
                            },
                            readNode: (nodeId, maxSize): FramebufferReadResult | FramebufferUnreadable => {
                                const source = graphDebugRef.current;
                                const topology = source?.topology();
                                const node = topology?.nodes.find(candidate => candidate.id === nodeId);
                                if (!node) {
                                    const known = topology?.nodes.map(candidate => candidate.id).join(', ') ?? '';
                                    throw new Error(
                                        `micugl devtools: graph.readNode has no node "${nodeId}". Known node ids: ${known}.`
                                    );
                                }
                                const currentManager = managerWeak.deref();
                                if (!currentManager || !readyRef.current) {
                                    return { unreadable: 'engine destroyed' };
                                }
                                if (node.framebufferId !== null) {
                                    return currentManager.fbo.debugReadFramebuffer(node.framebufferId, maxSize);
                                }
                                const rootCanvas = currentManager.context.canvas as HTMLCanvasElement;
                                const rootWidth = rootCanvas.width;
                                const rootHeight = rootCanvas.height;
                                if (rootWidth <= 0 || rootHeight <= 0) {
                                    return { unreadable: 'framebuffer has zero size' };
                                }
                                if (maxSize !== undefined && (rootWidth > maxSize || rootHeight > maxSize)) {
                                    return {
                                        unreadable: `framebuffer ${rootWidth}x${rootHeight} exceeds capture maxSize ${maxSize}`
                                    };
                                }
                                const passSystem = passSystemRef.current;
                                if (!passSystem) {
                                    return { unreadable: 'engine destroyed' };
                                }
                                const gl = currentManager.context;
                                if (gl.isContextLost()) {
                                    return { unreadable: 'engine destroyed' };
                                }
                                const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
                                const previousViewport = gl.getParameter(gl.VIEWPORT) as ArrayLike<number>;
                                try {
                                    passSystem.execute(frameToMs(controllerRef.current?.getFrame() ?? 0));
                                    const pixels = currentManager.readPixels(rootWidth, rootHeight);
                                    return { width: rootWidth, height: rootHeight, pixels };
                                } catch {
                                    return { unreadable: 'engine destroyed' };
                                } finally {
                                    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
                                    gl.viewport(
                                        previousViewport[0],
                                        previousViewport[1],
                                        previousViewport[2],
                                        previousViewport[3]
                                    );
                                }
                            }
                        };
                    }
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
            passSystemRef.current = null;
            emitEngineUnmount(engineIdRef.current);
        };
    }, [workerActive, contentKey, epoch, debugPortRef, graphDebugRef]);

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
        if (workerActive) {
            const bridge = bridgeRef.current;
            if (!bridge || workerPasses === appliedPassesRef.current) return;

            appliedPassesRef.current = workerPasses;
            bridge.setPasses(workerPasses);
            return;
        }

        const passSystem = passSystemRef.current;
        if (!passSystem || !readyRef.current) return;

        if (passes === appliedPassesRef.current) {
            return;
        }
        appliedPassesRef.current = passes;

        passSystem.clearPasses();
        passes.forEach(pass => {
            passSystem.addPass(pass);
        });
        passSystem.initializeResources();
        controllerRef.current?.invalidate();
    }, [workerActive, passes, workerPasses]);

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

    useImperativeHandle(ref, (): PingPongShaderHandle => workerActive ? {
        invalidate: invalidateAll,
        setFrame: (frame: number) => { bridgeRef.current?.renderFrame(frameToMs(frame)) },
        getFrame: () => { throw new Error(workerGetFrameMessage('PingPongShaderEngine')) },
        start: () => { setStopped(false) },
        stop: () => { setStopped(true) },
        resetSimulation: deny('resetSimulation'),
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
        resetSimulation: (seed?: SeedOptions) => { resetSimulation(seed) },
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
                throw new Error('PingPongShaderEngine.captureStream: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('PingPongShaderEngine.captureStream: WebGL context is lost');
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            if (typeof canvas.captureStream !== 'function') {
                throw new Error('PingPongShaderEngine.captureStream: this canvas does not support captureStream');
            }
            return canvas.captureStream(fps ?? 60);
        },
        record: (options?: RecordOptions) => {
            const manager = managerRef.current;
            if (!readyRef.current || !manager) {
                throw new Error('PingPongShaderEngine.record: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('PingPongShaderEngine.record: WebGL context is lost');
            }
            if (controllerRef.current?.getMotionGate() !== 'none') {
                throw new Error(
                    'PingPongShaderEngine.record: recording a motion-gated engine captures a frozen poster; ' +
                    'set reducedMotion="ignore"/saveData="ignore", or use renderSequence() instead'
                );
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            return createRecording(canvas, options);
        },
        renderSequence: (options: SequenceOptions) => {
            const manager = managerRef.current;
            const passSystem = passSystemRef.current;
            if (!readyRef.current || !manager || !passSystem) {
                throw new Error('PingPongShaderEngine.renderSequence: engine is not ready');
            }
            if (manager.context.isContextLost()) {
                throw new Error('PingPongShaderEngine.renderSequence: WebGL context is lost');
            }
            const blocker = capturesAreNonReproducible?.();
            if (blocker) {
                throw new Error(nonReproducibleCaptureMessage('PingPongShaderEngine', 'renderSequence', blocker));
            }
            const canvas = manager.context.canvas as HTMLCanvasElement;
            const controller = controllerRef.current;
            const wasRunning = controller !== null && !controller.isPaused();
            if (wasRunning) {
                controller.stop();
            }
            return runRenderSequence(
                {
                    canvas,
                    renderAtMs: t => { passSystem.execute(t) },
                    reset: color => { passSystem.reset(color) },
                    isTimePure: () => passSystem.isTimePure()
                },
                options
            ).finally(() => {
                if (options.seed === undefined) {
                    passSystem.execute(frameToMs(controllerRef.current?.getFrame() ?? 0));
                }
                if (wasRunning && controllerRef.current === controller) {
                    controller.start();
                }
            });
        }
    }, [workerActive, resetSimulation, captureStill, setStopped, invalidateAll, capturesAreNonReproducible]);

    if (workerActive && block) {
        throw new Error(workerBlockMessage('PingPongShaderEngine', block));
    }

    if (session.error) {
        throw session.error;
    }

    return (
        <canvas
            key={canvasKey}
            ref={canvasRef}
            className={className}
            style={{
                width: '100%',
                height: '100%',
                display: 'block',
                ...style
            }}
        />
    );
});

PingPongShaderEngineComponent.displayName = 'PingPongShaderEngine';

export const PingPongShaderEngine = memo(PingPongShaderEngineComponent);
