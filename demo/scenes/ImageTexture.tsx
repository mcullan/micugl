import { type DragEvent, useState } from 'react';

import { createShaderConfig } from '../../src/core/lib/createShaderConfig';
import { BaseShaderComponent } from '../../src/react/components/base/BaseShaderComponent';
import { useImageTexture } from '../../src/react/hooks/useImageTexture';
import type { ImageInput } from '../../src/types';
import { QUAD_VERTEX } from './shaders';

const DEFAULT_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGN44FChIWCAST'
    + 'JgFX3gUMEwKHUAAA4/QAFwjPYbAAAAAElFTkSuQmCC';

const OVERLAY_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNwOHFHQMMAk2'
    + 'TAKupw4g7DoNQBAKDsSYGcBnKmAAAAAElFTkSuQmCC';

const FRAGMENT = `
    precision highp float;
    uniform sampler2D u_image;
    uniform sampler2D u_overlay;
    varying vec2 v_uv;
    void main() {
        vec4 base = texture2D(u_image, v_uv);
        vec4 over = texture2D(u_overlay, v_uv);
        float strip = step(0.72, v_uv.x) * step(0.72, v_uv.y);
        gl_FragColor = vec4(mix(base.rgb, over.rgb, strip), 1.0);
    }
`;

const config = createShaderConfig({
    vertexShader: QUAD_VERTEX,
    fragmentShader: FRAGMENT
});

export const ImageTexture = () => {
    const [input, setInput] = useState<ImageInput | null>(DEFAULT_IMAGE);
    const image = useImageTexture(input);
    const overlay = useImageTexture(OVERLAY_IMAGE);

    const acceptFile = (file: File | undefined): void => {
        if (file) {
            setInput(file);
        }
    };

    const onDrop = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
        acceptFile(event.dataTransfer.files[0]);
    };

    const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
    };

    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{ width: '100vw', height: '100vh', position: 'relative' }}
        >
            <BaseShaderComponent
                programId='image-texture'
                shaderConfig={config}
                uniforms={{}}
                textures={{ image: image.texture, overlay: overlay.texture }}
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
                    lineHeight: 1.6
                }}
            >
                <div>u_image status: {image.status}</div>
                <div>u_overlay status: {overlay.status}</div>
                <div>drop an image anywhere, or pick a file</div>
                <input
                    type='file'
                    accept='image/*'
                    onChange={event => { acceptFile(event.target.files?.[0]) }}
                    style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                />
            </div>
        </div>
    );
};
