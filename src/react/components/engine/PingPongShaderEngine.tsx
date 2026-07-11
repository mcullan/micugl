import {
    type CSSProperties,
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState
} from 'react';

import type {
    FramebufferOptions,
    RenderPass,
    ShaderProgramConfig
} from '@/core';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import type { EngineDebugState, EngineHandle } from '@/react/devtools/beacon';
import { emitEngineMount, emitEngineUnmount } from '@/react/devtools/beacon';
import { framebuffersContentKey, programConfigsContentKey } from '@/react/lib/contentKeys';
import { RenderLoop } from '@/react/lib/renderLoop';
import {
    DEFAULT_DPR,
    DEFAULT_MAX_PIXEL_COUNT,
    resolveDeviceResolution,
    resolveResolution
} from '@/react/lib/resolution';
import type { Dpr, RenderControlProps, ShaderHandle } from '@/types';

interface PingPongShaderEngineProps extends RenderControlProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    className?: string;
    style?: CSSProperties;
    renderWidth?: number;
    renderHeight?: number;
    debug?: boolean;
}

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

const PingPongShaderEngineComponent = forwardRef<ShaderHandle, PingPongShaderEngineProps>(({
    programConfigs,
    passes,
    framebuffers,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    width,
    height,
    renderWidth,
    renderHeight,
    debug = false,
    useDevicePixelRatio,
    pixelRatio,
    frameloop = 'always',
    speed = 1,
    pauseWhenHidden = true,
    dpr = DEFAULT_DPR,
    maxPixelCount = DEFAULT_MAX_PIXEL_COUNT,
    fit = 'window'
}, ref) => {
    const contentKey = `${programConfigsContentKey(programConfigs)}\u0002${framebuffersContentKey(framebuffers)}`;

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

    const initPropsRef = useRef({ programConfigs, framebuffers, passes });

    const [epoch, setEpoch] = useState(0);

    const dprMin = Array.isArray(dpr) ? dpr[0] : dpr;
    const dprMax = Array.isArray(dpr) ? dpr[1] : dpr;

    const renderFrame = useCallback((elapsed: number) => {
        if (!readyRef.current) return;

        const manager = managerRef.current;
        const passSystem = passSystemRef.current;
        if (!manager || !passSystem) return;

        passSystem.execute(elapsed);
    }, []);

    const applySize = useCallback(() => {
        const manager = managerRef.current;
        const canvas = canvasRef.current;
        if (!readyRef.current || !manager || !canvas) return;

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

    useEffect(() => {
        initPropsRef.current = { programConfigs, framebuffers, passes };
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
        if (!canvasRef.current) return;

        const manager = new WebGLManager(canvasRef.current);
        managerRef.current = manager;

        if (!manager.context.isContextLost()) {
            const { programConfigs: configs, framebuffers: fbs, passes: initialPasses } = initPropsRef.current;

            Object.entries(configs).forEach(([id, config]) => {
                manager.createProgram(id, config);
            });

            Object.entries(fbs ?? {}).forEach(([id, options]) => {
                manager.fbo.createFramebuffer(id, options);
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
                setFrameloop: mode => { controllerRef.current?.setFrameloop(mode) }
            };
            emitEngineMount(handle);
        }

        return () => {
            readyRef.current = false;
            controllerRef.current?.stop();
            manager.destroyAll();
            passSystemRef.current = null;
            emitEngineUnmount(engineIdRef.current);
        };
    }, [contentKey, epoch]);

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
    }, [fit, width, height, applySize]);

    useEffect(() => {
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
    }, [passes]);

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;

        const onVisibility = () => {
            controller.setVisible(typeof document === 'object' ? !document.hidden : true);
        };

        if (typeof document === 'object') {
            controller.setVisible(!document.hidden);
            document.addEventListener('visibilitychange', onVisibility);
        }

        let observer: IntersectionObserver | null = null;
        const canvas = canvasRef.current;
        if (canvas && typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver(entries => {
                const entry = entries[entries.length - 1] as IntersectionObserverEntry | undefined;
                if (entry) {
                    controller.setIntersecting(entry.isIntersecting);
                }
            }, { threshold: 0 });
            observer.observe(canvas);
        } else {
            controller.setIntersecting(true);
        }

        return () => {
            if (typeof document === 'object') {
                document.removeEventListener('visibilitychange', onVisibility);
            }
            observer?.disconnect();
        };
    }, []);

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;

        controller.setFrameloop(frameloop);
        controller.setSpeed(speed);
        controller.setPauseWhenHidden(pauseWhenHidden);
    }, [frameloop, speed, pauseWhenHidden]);

    useEffect(() => {
        if (!debug) return;
        let cancelled = false;
        void import('@/react/devtools/attach').then(module => {
            if (!cancelled) {
                module.ensureDevtoolsMounted();
            }
        });
        return () => { cancelled = true };
    }, [debug]);

    useEffect(() => {
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
    }, []);

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

    useImperativeHandle(ref, () => ({
        invalidate: () => { controllerRef.current?.invalidate() },
        setFrame: (frame: number) => { controllerRef.current?.setFrame(frame) },
        getFrame: () => controllerRef.current?.getFrame() ?? 0,
        start: () => { controllerRef.current?.start() },
        stop: () => { controllerRef.current?.stop() }
    }), []);

    return (
        <canvas
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
