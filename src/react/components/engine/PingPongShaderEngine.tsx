import React, { useCallback, useEffect, useRef } from 'react';

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
    style?: React.CSSProperties;
    useDevicePixelRatio?: boolean;
}

const DEFAULT_CLASS_NAME = '';
const DEFAULT_STYLE: React.CSSProperties = {};

export const PingPongShaderEngine: React.FC<PingPongShaderEngineProps> = ({
    programConfigs,
    passes,
    framebuffers,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    useDevicePixelRatio = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<WebGLManager | null>(null);
    const passSystemRef = useRef<Passes | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

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

        const width = window.innerWidth;
        const height = window.innerHeight;

        managerRef.current.setSize(width, height, useDevicePixelRatio);

        const manager = managerRef.current;
        const canvas = manager.context.canvas;

        Object.entries(framebuffers ?? []).forEach(([id, options]) => {
            const fbWidth = options.width || canvas.width;
            const fbHeight = options.height || canvas.height;

            manager.fbo.resizeFramebuffer(id, fbWidth, fbHeight);
        });
    }, [framebuffers, useDevicePixelRatio]);

    useEffect(() => {
        if (!canvasRef.current) return;

        try {
            const manager = new WebGLManager(canvasRef.current);
            managerRef.current = manager;

            Object.entries(programConfigs).forEach(([id, config]) => {
                manager.createProgram(id, config);
            });

            Object.entries(framebuffers ?? []).forEach(([id, options]) => {
                manager.fbo.createFramebuffer(id, options);
            });

            const passSystem = new Passes(manager);
            passSystemRef.current = passSystem;

            passes.forEach(pass => {
                passSystem.addPass(pass);
            });

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
        } catch (error) {
            console.error('Failed to initialize WebGL:', error);
            return () => { void 1 };
        }
    }, [programConfigs, passes, framebuffers, handleResize]);

    useEffect(() => {
        const passSystem = passSystemRef.current;
        if (!passSystem) return;

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
