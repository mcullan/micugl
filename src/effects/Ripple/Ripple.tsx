import { forwardRef, useCallback, useEffect, useRef } from 'react';

import { createShaderConfig } from '@/core';
import { GL_FLOAT, GL_LINEAR } from '@/core/lib/glConstants';
import type { EffectRenderProps } from '@/effects/lib/effectProps';
import {
    rippleRenderFragmentShader,
    rippleSimulationFragmentShader,
    rippleVertexShader
} from '@/effects/Ripple/rippleShaders';
import type { RipplePointer } from '@/effects/Ripple/rippleUniforms';
import { rippleRenderUniforms, rippleSimUniforms } from '@/effects/Ripple/rippleUniforms';
import { BasePingPongShaderComponent } from '@/react/components/base/BasePingPongShaderComponent';
import type { AudioUniformsResult } from '@/react/hooks/useAudioUniforms';
import { useMotionGate } from '@/react/hooks/useMotionGate';
import type { FramebufferOptions, PingPongShaderHandle, Vec2, Vec3 } from '@/types';

export interface RippleProps extends EffectRenderProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    interactive?: boolean;
    audio?: AudioUniformsResult;
    audioStrength?: number;
}

const SIM_PROGRAM_ID = 'micugl-effect-ripple-sim';
const RENDER_PROGRAM_ID = 'micugl-effect-ripple-render';

const simConfig = createShaderConfig({
    vertexShader: rippleVertexShader,
    fragmentShader: rippleSimulationFragmentShader,
    uniformNames: {
        u_mouse: 'vec2',
        u_mouseForce: 'float',
        u_damping: 'float',
        u_autoDrip: 'float',
        u_audioLevel: 'float',
        u_audioStrength: 'float'
    }
});

const renderConfig = createShaderConfig({
    vertexShader: rippleVertexShader,
    fragmentShader: rippleRenderFragmentShader,
    uniformNames: {
        u_color1: 'vec3',
        u_color2: 'vec3'
    }
});

const FEEDBACK_FBO: FramebufferOptions = {
    width: 0,
    height: 0,
    textureCount: 2,
    textureOptions: {
        type: GL_FLOAT,
        minFilter: GL_LINEAR,
        magFilter: GL_LINEAR
    }
};

const CENTER: Vec2 = [0.5, 0.5];

export const Ripple = forwardRef<PingPongShaderHandle, RippleProps>((props, ref) => {
    const {
        damping,
        mouseForce = 0.5,
        color1,
        color2,
        iterations = 2,
        interactive = true,
        audio,
        audioStrength,
        reducedMotion,
        saveData,
        ...renderProps
    } = props;

    const handleRef = useRef<PingPongShaderHandle | null>(null);
    const mousePos = useRef<Vec2>(CENTER);
    const isMouseDown = useRef(false);

    const setRef = useCallback((instance: PingPongShaderHandle | null) => {
        handleRef.current = instance;
        if (typeof ref === 'function') {
            ref(instance);
        } else if (ref) {
            ref.current = instance;
        }
    }, [ref]);

    useEffect(() => {
        if (!interactive) {
            return;
        }

        const readPosition = (target: EventTarget | null, clientX: number, clientY: number): void => {
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const rect = target.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }
            mousePos.current = [
                (clientX - rect.left) / rect.width,
                1.0 - (clientY - rect.top) / rect.height
            ];
        };

        const requestFrame = (): void => {
            handleRef.current?.invalidate();
        };

        const onMouseMove = (event: MouseEvent): void => {
            readPosition(event.target, event.clientX, event.clientY);
            requestFrame();
        };
        const onMouseDown = (): void => {
            isMouseDown.current = true;
            requestFrame();
        };
        const onMouseUp = (): void => {
            isMouseDown.current = false;
            requestFrame();
        };
        const onTouchStart = (event: TouchEvent): void => {
            if (event.touches.length === 0) {
                return;
            }
            event.preventDefault();
            const touch = event.touches[0];
            readPosition(event.target, touch.clientX, touch.clientY);
            isMouseDown.current = true;
            requestFrame();
        };
        const onTouchMove = (event: TouchEvent): void => {
            if (event.touches.length === 0 || !isMouseDown.current) {
                return;
            }
            event.preventDefault();
            const touch = event.touches[0];
            readPosition(event.target, touch.clientX, touch.clientY);
            requestFrame();
        };
        const onTouchEnd = (): void => {
            isMouseDown.current = false;
            requestFrame();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
    }, [interactive]);

    const gate = useMotionGate(reducedMotion, saveData);
    const autoDrip = gate === 'none';

    const pointer: RipplePointer = {
        position: () => mousePos.current,
        force: () => (isMouseDown.current ? mouseForce : 0)
    };

    const simUniforms = rippleSimUniforms({ damping, mouseForce, autoDrip, audio, audioStrength }, pointer);
    const renderUniforms = rippleRenderUniforms({ color1, color2 });

    return (
        <BasePingPongShaderComponent
            ref={setRef}
            feedback
            programId={SIM_PROGRAM_ID}
            shaderConfig={simConfig}
            secondaryProgramId={RENDER_PROGRAM_ID}
            secondaryShaderConfig={renderConfig}
            iterations={iterations}
            uniforms={simUniforms}
            secondaryUniforms={renderUniforms}
            framebufferOptions={FEEDBACK_FBO}
            reducedMotion={reducedMotion}
            saveData={saveData}
            {...renderProps}
        />
    );
});

Ripple.displayName = 'Ripple';
