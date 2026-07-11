import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';

import type {
    FramebufferOptions,
    RenderPass,
    ShaderProgramConfig
} from '@/core';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';
import { framebuffersContentKey, programConfigsContentKey } from '@/react/lib/contentKeys';

interface PingPongShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    passes: RenderPass[];
    framebuffers?: Record<string, FramebufferOptions>;
    className?: string;
    style?: CSSProperties;
    width?: number;
    height?: number;
    renderWidth?: number;
    renderHeight?: number;
    useDevicePixelRatio?: boolean;
    pixelRatio?: number;
}

const DEFAULT_CLASS_NAME = '';
const DEFAULT_STYLE: CSSProperties = {};

interface EngineInitMetrics {
    engineSkippedInits: number;
    engineActualInits: number;
}

function readEngineMetrics(): EngineInitMetrics | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    return (window as unknown as { __micuglMetrics?: EngineInitMetrics }).__micuglMetrics;
}

function serializePasses(passes: RenderPass[]): string {
    return passes.map(p =>
        `${p.programId}|${p.outputFramebuffer ?? 'screen'}|${p.inputTextures.map(t => t.id).join(',')}`
    ).join('||');
}

const PingPongShaderEngineComponent = ({
    programConfigs,
    passes,
    framebuffers,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    width,
    height,
    renderWidth,
    renderHeight,
    useDevicePixelRatio = true,
    pixelRatio
}: PingPongShaderEngineProps) => {
    const contentKey = `${programConfigsContentKey(programConfigs)}\u0002${framebuffersContentKey(framebuffers)}`;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<WebGLManager | null>(null);
    const passSystemRef = useRef<Passes | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);
    const passesKeyRef = useRef<string>('');

    const renderLoopRef = useRef<(time: number) => void>((time: number) => {
        const manager = managerRef.current;
        const passSystem = passSystemRef.current;

        if (!manager || !passSystem) return;

        const elapsedTime = time - startTimeRef.current;

        passSystem.execute(elapsedTime);

        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
    });

    const initPropsRef = useRef({ programConfigs, framebuffers, passes });
    useEffect(() => {
        initPropsRef.current = { programConfigs, framebuffers, passes };
    });

    const handleResize = useCallback(() => {
        if (!canvasRef.current || !managerRef.current) return;

        const displayWidth = width ?? window.innerWidth;
        const displayHeight = height ?? window.innerHeight;
        const dpr = pixelRatio ?? (useDevicePixelRatio ? window.devicePixelRatio : 1);

        const actualRenderWidth = renderWidth ?? Math.floor(displayWidth * dpr);
        const actualRenderHeight = renderHeight ?? Math.floor(displayHeight * dpr);

        const manager = managerRef.current;
        manager.setSize(actualRenderWidth, actualRenderHeight, displayWidth, displayHeight);

        const canvas = manager.context.canvas;

        Object.entries(initPropsRef.current.framebuffers ?? {}).forEach(([id, options]) => {
            const fbWidth = options.width || canvas.width;
            const fbHeight = options.height || canvas.height;

            manager.fbo.resizeFramebuffer(id, fbWidth, fbHeight);
        });
    }, [width, height, renderWidth, renderHeight, useDevicePixelRatio, pixelRatio]);

    const handleResizeRef = useRef(handleResize);

    useEffect(() => {
        if (!canvasRef.current) return;

        const manager = new WebGLManager(canvasRef.current);
        managerRef.current = manager;

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
        passesKeyRef.current = serializePasses(initialPasses);

        passSystem.initializeResources();

        handleResizeRef.current();

        if (startTimeRef.current === 0) {
            startTimeRef.current = performance.now();
        }
        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);

        const onWindowResize = () => { handleResizeRef.current() };
        window.addEventListener('resize', onWindowResize);

        return () => {
            window.removeEventListener('resize', onWindowResize);

            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }

            manager.destroyAll();
            managerRef.current = null;
            passSystemRef.current = null;
        };
    }, [contentKey]);

    useEffect(() => {
        handleResizeRef.current = handleResize;
        handleResize();
    }, [handleResize]);

    useEffect(() => {
        const passSystem = passSystemRef.current;
        if (!passSystem) return;

        const metrics = readEngineMetrics();
        const newKey = serializePasses(passes);
        if (newKey === passesKeyRef.current) {
            if (metrics) {
                metrics.engineSkippedInits++;
            }
            return;
        }
        passesKeyRef.current = newKey;

        if (metrics) {
            metrics.engineActualInits++;
        }

        passSystem.clearPasses();
        passes.forEach(pass => {
            passSystem.addPass(pass);
        });
        passSystem.initializeResources();
    }, [passes]);

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
};

export const PingPongShaderEngine = memo(PingPongShaderEngineComponent);
