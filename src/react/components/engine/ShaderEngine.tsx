import { type CSSProperties, useCallback, useEffect, useRef } from 'react';

import type {
    RenderOptions,
    ShaderProgramConfig,
    ShaderRenderCallback,
    ShaderResources,
    UniformType,
    UniformUpdateFn,
} from '@/core';
import { WebGLManager } from '@/core/managers/WebGLManager';

interface ShaderEngineProps {
    programConfigs: Record<string, ShaderProgramConfig>;
    renderCallback: ShaderRenderCallback;
    renderOptions?: RenderOptions;
    className?: string;
    style?: CSSProperties;
    width?: number;
    height?: number;
    uniformUpdaters?: Record<string, {
        name: string;
        type: UniformType;
        updateFn: UniformUpdateFn<UniformType>;
    }[]>;
    useFastPath?: boolean;
    useDevicePixelRatio?: boolean;
    pixelRatio?: number;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {};
const DEFAULT_CLASS_NAME = '';
const DEFAULT_STYLE: CSSProperties = {};
const DEFAULT_UNIFORM_UPDATERS: Record<string, {
    name: string;
    type: UniformType;
    updateFn: UniformUpdateFn<UniformType>;
}[]> = {};

export const ShaderEngine = ({
    programConfigs,
    renderCallback,
    renderOptions = DEFAULT_RENDER_OPTIONS,
    className = DEFAULT_CLASS_NAME,
    style = DEFAULT_STYLE,
    width,
    height,
    uniformUpdaters = DEFAULT_UNIFORM_UPDATERS,
    useFastPath = false,
    useDevicePixelRatio = true,
    pixelRatio
}: ShaderEngineProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<WebGLManager | null>(null);
    const activeProgram = useRef<string | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    const renderLoopRef = useRef<(time: number) => void>((time: number) => {
        const manager = managerRef.current;
        const programId = activeProgram.current;

        if (!manager || !programId) return;

        const elapsedTime = time - startTimeRef.current;
        const gl = manager.context;

        if (useFastPath) {
            manager.fastRender(programId, elapsedTime, renderOptions.clear);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
            const resources = manager.resources.get(programId);
            if (!resources) return;

            manager.prepareRender(programId, renderOptions);
            stableRenderCallback(elapsedTime, resources, gl);
        }

        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
    });

    const stableRenderCallback = useCallback((time: number, resources: ShaderResources, gl: WebGLRenderingContext) => {
        renderCallback(time, resources, gl);
    }, [renderCallback]);

    useEffect(() => {
        renderLoopRef.current = (time: number) => {
            const manager = managerRef.current;
            const programId = activeProgram.current;

            if (!manager || !programId) return;

            const elapsedTime = time - startTimeRef.current;
            const gl = manager.context;

            if (useFastPath) {
                manager.fastRender(programId, elapsedTime, renderOptions.clear);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            } else {
                const resources = manager.resources.get(programId);
                if (!resources) return;

                manager.prepareRender(programId, renderOptions);
                stableRenderCallback(elapsedTime, resources, gl);
            }

            animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
        };
    }, [renderOptions, useFastPath, stableRenderCallback]);

    const handleResize = useCallback(() => {
        if (!canvasRef.current || !managerRef.current) return;

        const renderWidth = width ?? window.innerWidth;
        const renderHeight = height ?? window.innerHeight;

        const dpr = pixelRatio ?? (useDevicePixelRatio ? window.devicePixelRatio : 1);

        // Sets canvas.width, canvas.height, canvas.style.* and gl.viewport
        managerRef.current.setSize(renderWidth, renderHeight, dpr);
    }, [useDevicePixelRatio, pixelRatio, width, height]);
    
    useEffect(() => {
        if (!canvasRef.current) return;
        const manager = new WebGLManager(canvasRef.current);
        managerRef.current = manager;

        handleResize();
        const [[pid, cfg]] = Object.entries(programConfigs);
        manager.createProgram(pid, cfg);
        manager.createBuffer(pid, 'a_position', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
        manager.setAttributeOnce(pid, 'a_position', {
            name: 'a_position', size: 2, type: 'FLOAT',
            normalized: false, stride: 0, offset: 0
        });
        activeProgram.current = pid;

        startTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            manager.destroyAll();
        };
    }, [programConfigs, handleResize]);

    useEffect(() => {
        const manager = managerRef.current;
        const pid = activeProgram.current;
        if (!manager || !pid) return;

        const ups = uniformUpdaters[pid];

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!ups) return;
        ups.forEach(u => {
            manager.registerUniformUpdater(pid, u.name, u.type, u.updateFn);
        });
    }, [uniformUpdaters]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={style}
        />
    );
};
