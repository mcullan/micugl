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
import { WebGLManager } from '@/core/managers/WebGLManager';
import type { EngineDebugState, EngineHandle } from '@/react/devtools/beacon';
import { emitEngineMount, emitEngineUnmount } from '@/react/devtools/beacon';
import { useReducedMotion } from '@/react/hooks/useReducedMotion';
import { useSaveData } from '@/react/hooks/useSaveData';
import { programConfigContentKey, singleProgramEntry } from '@/react/lib/contentKeys';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';
import { resolveMotionGate } from '@/react/lib/motionPolicy';
import { RenderLoop } from '@/react/lib/renderLoop';
import {
    DEFAULT_DPR,
    DEFAULT_MAX_PIXEL_COUNT,
    resolveDeviceResolution,
    resolveResolution
} from '@/react/lib/resolution';
import type { Dpr, RenderControlProps, ShaderHandle } from '@/types';

interface UniformUpdaterEntry {
    name: string;
    type: UniformType;
    updateFn: UniformUpdateFn<UniformType>;
}

interface ShaderEngineProps extends RenderControlProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    renderCallback: ShaderRenderCallback;
    renderOptions?: RenderOptions;
    className?: string;
    style?: CSSProperties;
    uniformUpdaters?: Record<string, UniformUpdaterEntry[]>;
    useFastPath?: boolean;
    debug?: boolean;
    debugPortRef?: RefObject<UniformDebugPort | null>;
}

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
    debug = false,
    debugPortRef,
    useDevicePixelRatio,
    pixelRatio,
    frameloop = 'always',
    speed = 1,
    pauseWhenHidden = true,
    dpr = DEFAULT_DPR,
    maxPixelCount = DEFAULT_MAX_PIXEL_COUNT,
    fit = 'window',
    reducedMotion = 'static-frame',
    saveData = 'static-frame',
    staticFrame = 0
}, ref) => {
    const reducedMotionActive = useReducedMotion();
    const saveDataActive = useSaveData();
    const motionGate = resolveMotionGate({ reducedMotionActive, saveDataActive, reducedMotion, saveData });

    const [keyProgramId, keyProgramConfig] = singleProgramEntry(programConfigs);
    const contentKey = programConfigContentKey(keyProgramId, keyProgramConfig);

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

    const initPropsRef = useRef({ programConfigs, uniformUpdaters });
    const renderConfigRef = useRef({ useFastPath, renderOptions, renderCallback });

    const [epoch, setEpoch] = useState(0);

    const dprMin = Array.isArray(dpr) ? dpr[0] : dpr;
    const dprMax = Array.isArray(dpr) ? dpr[1] : dpr;

    const renderFrame = useCallback((elapsed: number) => {
        if (!readyRef.current) return;

        const manager = managerRef.current;
        const programId = activeProgram.current;
        if (!manager || !programId) return;

        const gl = manager.context;
        const { useFastPath: fast, renderOptions: options, renderCallback: callback } = renderConfigRef.current;

        if (fast) {
            manager.fastRender(programId, elapsed, options.clear);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
            const resources = manager.resources.get(programId);
            if (!resources) return;

            manager.prepareRender(programId, options);
            callback(elapsed, resources, gl);
        }
    }, []);

    const applySize = useCallback(() => {
        const manager = managerRef.current;
        const canvas = canvasRef.current;
        if (!readyRef.current || !manager || !canvas) return;

        const devicePixelRatio = readDevicePixelRatio();
        const disableDevicePixelRatio = useDevicePixelRatio === false;
        const resolvedDpr: Dpr = [dprMin, dprMax];

        if (fit === 'element') {
            const observed = observedSizeRef.current;
            const hasFixed = width !== undefined || height !== undefined;

            if (!hasFixed && observed?.deviceWidth !== undefined && observed.deviceHeight !== undefined) {
                const resolution = resolveDeviceResolution({
                    deviceWidth: observed.deviceWidth,
                    deviceHeight: observed.deviceHeight,
                    devicePixelRatio,
                    dpr: resolvedDpr,
                    maxPixelCount,
                    pixelRatioOverride: pixelRatio,
                    disableDevicePixelRatio
                });
                manager.setDrawingBufferSize(resolution.renderWidth, resolution.renderHeight);
                controllerRef.current?.invalidate();
                return;
            }

            const cssWidth = width ?? observed?.cssWidth ?? canvas.clientWidth;
            const cssHeight = height ?? observed?.cssHeight ?? canvas.clientHeight;
            const resolution = resolveResolution({
                displayWidth: cssWidth,
                displayHeight: cssHeight,
                devicePixelRatio,
                dpr: resolvedDpr,
                maxPixelCount,
                pixelRatioOverride: pixelRatio,
                disableDevicePixelRatio
            });
            manager.setDrawingBufferSize(resolution.renderWidth, resolution.renderHeight);
            controllerRef.current?.invalidate();
            return;
        }

        const displayWidth = width ?? (typeof window === 'object' ? window.innerWidth : 0);
        const displayHeight = height ?? (typeof window === 'object' ? window.innerHeight : 0);
        const resolution = resolveResolution({
            displayWidth,
            displayHeight,
            devicePixelRatio,
            dpr: resolvedDpr,
            maxPixelCount,
            pixelRatioOverride: pixelRatio,
            disableDevicePixelRatio
        });
        manager.setSize(resolution.renderWidth, resolution.renderHeight, displayWidth, displayHeight);
        controllerRef.current?.invalidate();
    }, [width, height, dprMin, dprMax, maxPixelCount, pixelRatio, useDevicePixelRatio, fit]);

    const applySizeRef = useRef(applySize);

    useEffect(() => {
        initPropsRef.current = { programConfigs, uniformUpdaters };
        renderConfigRef.current = { useFastPath, renderOptions, renderCallback };
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
            const [pid, cfg] = singleProgramEntry(initPropsRef.current.programConfigs);
            manager.createProgram(pid, cfg);
            manager.createBuffer(pid, 'a_position', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
            manager.setAttributeOnce(pid, 'a_position', {
                name: 'a_position', size: 2, type: 'FLOAT',
                normalized: false, stride: 0, offset: 0
            });
            activeProgram.current = pid;

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

        return () => {
            readyRef.current = false;
            controllerRef.current?.stop();
            manager.destroyAll();
            activeProgram.current = null;
            emitEngineUnmount(engineIdRef.current);
        };
    }, [contentKey, epoch, debugPortRef]);

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
        const controller = controllerRef.current;
        if (!controller) return;

        controller.setMotionGate(motionGate);
        if (motionGate === 'static') {
            controller.setFrame(staticFrame);
        }
    }, [motionGate, staticFrame]);

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
            style={style}
        />
    );
});

ShaderEngineComponent.displayName = 'ShaderEngine';

export const ShaderEngine = memo(ShaderEngineComponent);
