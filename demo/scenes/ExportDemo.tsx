import { useEffect, useRef } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import type { ShaderHandle, UniformParam } from '../../src/types';
import { QUAD_VERTEX, WAVE_FRAGMENT } from './shaders';

declare global {
    interface Window {
        __exportDemoHandle?: ShaderHandle;
    }
}

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: WAVE_FRAGMENT
});

const uniforms: Record<string, UniformParam> = {};

const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const ExportDemo = () => {
    const handleRef = useRef<ShaderHandle>(null);

    useEffect(() => {
        window.__exportDemoHandle = handleRef.current ?? undefined;
        return () => {
            window.__exportDemoHandle = undefined;
        };
    }, []);

    const handlePngExport = async (): Promise<void> => {
        const blob = await handleRef.current?.renderToBlob();
        if (blob) {
            downloadBlob(blob, 'export-demo.png');
        }
    };

    const handleRecord = (): void => {
        const recording = handleRef.current?.record({ fps: 60 });
        if (!recording) return;
        setTimeout(() => {
            void recording.stop().then(blob => { downloadBlob(blob, 'export-demo-recording.webm') });
        }, 2000);
    };

    const handleSequence = async (): Promise<void> => {
        const blob = await handleRef.current?.renderSequence({ fps: 30, durationSeconds: 2, container: 'webm' });
        if (blob) {
            downloadBlob(blob, 'export-demo-sequence.webm');
        }
    };

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <BaseShaderComponent
                ref={handleRef}
                programId='export-demo'
                shaderConfig={config}
                uniforms={uniforms}
                width={640}
                height={360}
                useDevicePixelRatio={false}
                frameloop='always'
                reducedMotion='ignore'
                saveData='ignore'
                style={{ width: '640px', height: '360px', display: 'block' }}
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
                <div>VideoEncoder available: {String('VideoEncoder' in globalThis)}</div>
                <button type='button' onClick={() => { void handlePngExport() }}>PNG @1x</button>
                <button type='button' onClick={handleRecord}>Record 2s (webm)</button>
                <button type='button' onClick={() => { void handleSequence() }}>Sequence 2s @30fps (webm)</button>
            </div>
        </div>
    );
};
