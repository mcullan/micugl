import { memo, useEffect, useRef, useState } from 'react';

import { createShaderConfig } from '../src/core/lib/createShaderConfig';
import { vec3 } from '../src/core/lib/vectorUtils';
import { PingPongShaderEngine } from '../src/react/components/engine/PingPongShaderEngine';
import { usePingPongPasses } from '../src/react/hooks/usePingPongPasses';
import type { ShaderProgramConfig } from '../src/types';

const vertexShader = /* glsl */`
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

const simulationShader = /* glsl */`
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  varying vec2 v_texCoord;
  
  void main() {
    vec2 uv = v_texCoord;
    vec2 texelSize = 1.0 / u_resolution;
    
    vec4 state = texture2D(u_texture0, uv);
    float height = state.r;
    float velocity = state.g;
    
    float north = texture2D(u_texture0, uv + vec2(0.0, texelSize.y)).r;
    float south = texture2D(u_texture0, uv - vec2(0.0, texelSize.y)).r;
    float east = texture2D(u_texture0, uv + vec2(texelSize.x, 0.0)).r;
    float west = texture2D(u_texture0, uv - vec2(texelSize.x, 0.0)).r;
    
    float newVelocity = velocity + ((north + south + east + west) / 4.0 - height) * 2.0;
    newVelocity *= 0.99;
    float newHeight = height + newVelocity;
    
    float t = u_time * 0.001;
    vec2 center = vec2(0.5 + 0.3 * sin(t), 0.5 + 0.3 * cos(t * 1.3));
    if (length(uv - center) < 0.03) {
      newHeight += 0.3;
    }
    
    gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);
  }
`;

const renderShader = /* glsl */`
  precision highp float;
  uniform sampler2D u_texture0;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  varying vec2 v_texCoord;
  
  void main() {
    float height = texture2D(u_texture0, v_texCoord).r;
    vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface PerformanceMetrics {
    shaderRenderCount: number;
}

const metrics: PerformanceMetrics = {
    shaderRenderCount: 0
};

const MetricsDisplay = () => {
    const [displayMetrics, setDisplayMetrics] = useState<PerformanceMetrics>({ ...metrics });

    useEffect(() => {
        const interval = setInterval(() => {
            setDisplayMetrics({ ...metrics });
        }, 500);
        return () => { clearInterval(interval) };
    }, []);

    return (
        <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'rgba(0,0,0,0.8)',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: 1.6
        }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Performance Metrics</div>
            <div>Shader component renders: <strong>{displayMetrics.shaderRenderCount}</strong></div>
            <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
                Click "Force Parent Rerender" to test stability.<br/>
                Passes stay identity-stable, so the engine does not rebuild.
            </div>
        </div>
    );
};

const ShaderScene = memo(({ iterations }: { iterations: number }) => {
    const renderCountRef = useRef(0);
    renderCountRef.current++;
    metrics.shaderRenderCount = renderCountRef.current;

    const simulationConfig = createShaderConfig({
        vertexShader,
        fragmentShader: simulationShader,
        uniformNames: {
            u_texture0: 'sampler2D',
        }
    });

    const renderConfig = createShaderConfig({
        vertexShader,
        fragmentShader: renderShader,
        uniformNames: {
            u_texture0: 'sampler2D',
            u_color1: 'vec3',
            u_color2: 'vec3'
        }
    });

    const programConfigs: Record<string, ShaderProgramConfig> = {
        'perf-sim': simulationConfig,
        'perf-render': renderConfig
    };

    const { passes, framebuffers } = usePingPongPasses({
        programId: 'perf-sim',
        secondaryProgramId: 'perf-render',
        iterations,
        uniforms: {},
        secondaryUniforms: {
            u_color1: { type: 'vec3', value: vec3([0.1, 0.2, 0.4]) },
            u_color2: { type: 'vec3', value: vec3([0.4, 0.2, 0.3]) }
        },
        framebufferOptions: {
            width: 0,
            height: 0,
            textureCount: 2,
            textureOptions: {
                minFilter: WebGLRenderingContext.LINEAR,
                magFilter: WebGLRenderingContext.LINEAR
            }
        }
    });

    useEffect(() => {
        console.log(`[ShaderScene] Render #${renderCountRef.current}, iterations=${iterations}, passes.length=${passes.length}`);
    });

    return (
        <PingPongShaderEngine
            programConfigs={programConfigs}
            passes={passes}
            framebuffers={framebuffers}
            style={{ width: '100%', height: '100%' }}
        />
    );
});

export const PerformanceTest = ({ 
    iterations,
    parentRerenderCount 
}: { 
    iterations: number;
    parentRerenderCount: number;
}) => {
    useEffect(() => {
        console.log(`[PerformanceTest] Parent render, parentRerenderCount=${parentRerenderCount}`);
    });

    return (
        <>
            <ShaderScene iterations={iterations} />
            <MetricsDisplay />
        </>
    );
};
