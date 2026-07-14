import type { RenderOptions, TextureOptions } from '@/types';

export interface NodePlacementProps {
    id: string;
    width?: number;
    height?: number;
    textureOptions?: Partial<TextureOptions>;
    renderOptions?: RenderOptions;
}
