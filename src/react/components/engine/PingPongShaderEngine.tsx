import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import type {
    FramebufferOptions,
    RenderPass,
    ShaderProgramConfig
} from '@/core';
import { WebGLManager } from '@/core/managers/WebGLManager';
import { Passes } from '@/core/systems/Passes';

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

function serializePasses(passes: RenderPass[]): string {
    return passes.map(p => 
        `${p.programId}|${p.outputFramebuffer ?? 'screen'}|${p.inputTextures.map(t => t.id).join(',')}`
    ).join('||');
}

export const PingPongShaderEngine = ({
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

    const handleResize = useCallback(() => {
        if (!canvasRef.current || !managerRef.current) return;

        const displayWidth = width ?? window.innerWidth;
        const displayHeight = height ?? window.innerHeight;
        const dpr = pixelRatio ?? (useDevicePixelRatio ? window.devicePixelRatio : 1);

        const actualRenderWidth = renderWidth ?? Math.floor(displayWidth * dpr);
        const actualRenderHeight = renderHeight ?? Math.floor(displayHeight * dpr);

        managerRef.current.setSize(actualRenderWidth, actualRenderHeight, displayWidth, displayHeight);

        const manager = managerRef.current;
        const canvas = manager.context.canvas;

        Object.entries(framebuffers ?? {}).forEach(([id, options]) => {
            const fbWidth = options.width || canvas.width;
            const fbHeight = options.height || canvas.height;

            manager.fbo.resizeFramebuffer(id, fbWidth, fbHeight);
        });
    }, [framebuffers, width, height, renderWidth, renderHeight, useDevicePixelRatio, pixelRatio]);

    useEffect(() => {
        if (!canvasRef.current) return;

        const manager = new WebGLManager(canvasRef.current);
        managerRef.current = manager;

        Object.entries(programConfigs).forEach(([id, config]) => {
            manager.createProgram(id, config);
        });

        Object.entries(framebuffers ?? {}).forEach(([id, options]) => {
            manager.fbo.createFramebuffer(id, options);
        });

        const passSystem = new Passes(manager);
        passSystemRef.current = passSystem;

        passes.forEach(pass => {
            passSystem.addPass(pass);
        });
        passesKeyRef.current = serializePasses(passes);

        passSystem.initializeResources();

        handleResize();

        startTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);

            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }

            if (managerRef.current) {
                managerRef.current.destroyAll();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- passes handled in separate effect to avoid full re-init
    }, [programConfigs, framebuffers, handleResize]);

    useEffect(() => {
        const passSystem = passSystemRef.current;
        if (!passSystem) return;

        const newKey = serializePasses(passes);
        if (newKey === passesKeyRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (window as any).__micuglMetrics.engineSkippedInits++;
            }
            return;
        }
        passesKeyRef.current = newKey;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof window !== 'undefined' && (window as any).__micuglMetrics) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (window as any).__micuglMetrics.engineActualInits++;
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
