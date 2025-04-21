import React, { useRef } from 'react';

import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { vec2, vec3 } from '@/core/lib/vectorUtils';
import { BasePingPongShaderComponent } from '@/react/components/base/BasePingPongShaderComponent';

import { rippleRenderShader, rippleSimulationShader, rippleVertexShader } from './rippleShaders';

type Vec3 = [number, number, number];

export interface SimpleRippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    className?: string;
    style?: React.CSSProperties;
}

const COLOR_1: Vec3 = [0.1, 0.3, 0.1];
const COLOR_2: Vec3 = [0.3, 0.2, 0.4];

export const SimpleRipple: React.FC<SimpleRippleProps> = ({
    damping = 0.99,
    mouseForce = 0.5,
    color1 = COLOR_1,
    color2 = COLOR_2,
    iterations = 2,
    className = '',
    style
}) => {
    const mousePos = useRef<[number, number]>([0.5, 0.5]);
    const isMouseDown = useRef(false);

    const simulationShaderConfig = createShaderConfig({
        vertexShader: rippleVertexShader,
        fragmentShader: rippleSimulationShader,
        uniformNames: {
            u_texture0: 'sampler2D',
            u_mouse: 'vec2',
            u_mouseForce: 'float',
            u_damping: 'float'
        }
    });

    const renderShaderConfig = createShaderConfig({
        vertexShader: rippleVertexShader,
        fragmentShader: rippleRenderShader,
        uniformNames: {
            u_texture0: 'sampler2D',
            u_color1: 'vec3',
            u_color2: 'vec3'
        }
    });

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const canvas = e.target as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = 1.0 - (e.clientY - rect.top) / rect.height;

            mousePos.current = [x, y];
        };

        const handleMouseDown = () => {
            isMouseDown.current = true;
        };

        const handleMouseUp = () => {
            isMouseDown.current = false;
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                e.preventDefault();
                const canvas = e.target as HTMLCanvasElement;
                const rect = canvas.getBoundingClientRect();
                const x = (e.touches[0].clientX - rect.left) / rect.width;
                const y = 1.0 - (e.touches[0].clientY - rect.top) / rect.height;

                mousePos.current = [x, y];
                isMouseDown.current = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 0 && isMouseDown.current) {
                e.preventDefault();
                const canvas = e.target as HTMLCanvasElement;
                const rect = canvas.getBoundingClientRect();
                const x = (e.touches[0].clientX - rect.left) / rect.width;
                const y = 1.0 - (e.touches[0].clientY - rect.top) / rect.height;

                mousePos.current = [x, y];
            }
        };

        const handleTouchEnd = () => {
            isMouseDown.current = false;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    return (
        <BasePingPongShaderComponent
            programId='ripple-simulation'
            shaderConfig={simulationShaderConfig}
            secondaryProgramId='ripple-render'
            secondaryShaderConfig={renderShaderConfig}
            iterations={iterations}
            className={className}
            style={style}
            framebufferOptions={{
                width: 0,
                height: 0,
                textureCount: 2,
                textureOptions: {
                    minFilter: WebGLRenderingContext.LINEAR,
                    magFilter: WebGLRenderingContext.LINEAR
                }
            }}
            uniforms={{
                u_mouse: {
                    type: 'vec2',
                    value: vec2(mousePos.current)
                },
                u_mouseForce: {
                    type: 'float',
                    value: () => isMouseDown.current ? mouseForce : 0.0
                },
                u_damping: {
                    type: 'float',
                    value: damping
                }
            }}
            secondaryUniforms={{
                u_color1: {
                    type: 'vec3',
                    value: vec3(color1)
                },
                u_color2: {
                    type: 'vec3',
                    value: vec3(color2)
                }
            }}
        />
    );
};

export default SimpleRipple;
