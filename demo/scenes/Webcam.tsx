import { useRef, useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useWebcamTexture } from '../../src/react/hooks/useWebcamTexture';
import type { ShaderHandle } from '../../src/types';
import { QUAD_VERTEX } from './shaders';

const FRAGMENT = `
    precision highp float;
    uniform sampler2D u_cam;
    varying vec2 v_uv;
    void main() {
        vec2 uv = vec2(1.0 - v_uv.x, v_uv.y);
        vec3 cam = texture2D(u_cam, uv).rgb;
        float luma = dot(cam, vec3(0.299, 0.587, 0.114));
        float bands = step(0.5, fract(uv.y * 24.0));
        vec3 tint = mix(vec3(0.1, 0.4, 0.9), vec3(1.0, 0.6, 0.2), luma);
        vec3 filtered = mix(cam, cam * tint * 1.6, 0.6);
        gl_FragColor = vec4(mix(filtered, filtered * 0.7, bands), 1.0);
    }
`;

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: FRAGMENT
});

const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const Webcam = () => {
    const handleRef = useRef<ShaderHandle>(null);
    const [error, setError] = useState<string | null>(null);
    const cam = useWebcamTexture({
        onError: caught => { setError(caught instanceof Error ? caught.message : String(caught)) }
    });

    const enable = (): void => {
        setError(null);
        void cam.start();
    };

    const capture = async (): Promise<void> => {
        const blob = await handleRef.current?.renderToBlob();
        if (blob) {
            downloadBlob(blob, 'webcam.png');
        }
    };

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BaseShaderComponent
                ref={handleRef}
                programId='webcam'
                shaderConfig={config}
                uniforms={{}}
                textures={{ cam: cam.texture }}
                frameloop='demand'
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    borderRadius: '4px',
                    lineHeight: 1.6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    alignItems: 'flex-start'
                }}
            >
                <div>camera status: {cam.status}</div>
                {error !== null && <div>error: {error}</div>}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type='button' onClick={enable}>Enable camera</button>
                    <button type='button' onClick={() => { cam.stop() }}>Disable camera</button>
                </div>
                <button type='button' onClick={() => { void capture() }}>Capture PNG</button>
            </div>
        </div>
    );
};
