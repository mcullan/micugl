import { createShaderConfig } from '_shaders/core/lib/createShaderConfig';
import { BaseShaderComponent } from '_shaders/react/components/base/BaseShaderComponent';
import { useDarkMode } from '_shaders/react/hooks/useDarkMode';
import React from 'react';

import { marbleFragmentShader, marbleVertexShader } from './marbleShaders';
type Vec3 = [number, number, number];

const COLOR_START: Vec3 = [0.8, 0.8, 0.9];
const COLOR_END: Vec3 = [0.3, 0.3, 0.6];
const VEIN_COLOR: Vec3 = [0.1, 0.1, 0.3];
const COLOR_START_DARK: Vec3 = [0.2, 0.2, 0.3];
const COLOR_END_DARK: Vec3 = [0.1, 0.1, 0.2];
const VEIN_COLOR_DARK: Vec3 = [0.05, 0.05, 0.1];

export interface MarbleProps {
    marbleScale?: number;
    tileScale?: number;
    turbulence?: number;
    swirl?: number;
    colorStart?: Vec3;
    colorEnd?: Vec3;
    veinColor?: Vec3;
    colorStartDark?: Vec3;
    colorEndDark?: Vec3;
    veinColorDark?: Vec3;
    veinFrequency?: number;
    veinWidth?: number;
    className?: string;
    style?: React.CSSProperties;
}

export const Marble: React.FC<MarbleProps> = ({
    marbleScale = 3.0,
    tileScale = 1.0,
    turbulence = 0.5,
    swirl = 6.0,
    veinFrequency = 6.0,
    veinWidth = 2.0,
    colorStart = COLOR_START,
    colorEnd = COLOR_END,
    veinColor = VEIN_COLOR,
    colorStartDark = COLOR_START_DARK,
    colorEndDark = COLOR_END_DARK,
    veinColorDark = VEIN_COLOR_DARK,
    className = '',
    style
}) => {
    const isDarkMode = useDarkMode();

    const toF32 = (arr: number[]): (() => Float32Array) => (
        () => new Float32Array(arr)
    );

    const shaderConfig = createShaderConfig({
        vertexShader: marbleVertexShader,
        fragmentShader: marbleFragmentShader,
        uniformNames: {
            u_marbleScale: 'float',
            u_tileScale: 'float',
            u_turbulence: 'float',
            u_swirl: 'float',
            u_colorStart: 'vec3',
            u_colorEnd: 'vec3',
            u_veinColor: 'vec3',
            u_veinFrequency: 'float',
            u_veinWidth: 'float'
        }
    });
    return (
        <BaseShaderComponent
            programId='marble-shader'
            shaderConfig={shaderConfig}
            className={className}
            style={style}
            uniforms={{
                marbleScale: { value: marbleScale, type: 'float' },
                tileScale: { value: tileScale, type: 'float' },
                turbulence: { value: turbulence, type: 'float' },
                swirl: { value: swirl, type: 'float' },
                veinFrequency: { value: veinFrequency, type: 'float' },
                veinWidth: { value: veinWidth, type: 'float' },
                colorStart: {
                    type: 'vec3',
                    value: toF32(isDarkMode ? colorStartDark : colorStart)
                    // value: toF32(isDarkMode ? colorStartDark : colorStart)
                },
                colorEnd: {
                    type: 'vec3',
                    value: toF32(isDarkMode ? colorEndDark : colorEnd)
                },
                veinColor: {
                    type: 'vec3',
                    value: toF32(isDarkMode ? veinColorDark : veinColor)
                }
            }}
        />
    );
};

export default Marble;
