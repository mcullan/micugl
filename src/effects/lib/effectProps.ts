import type { CSSProperties } from 'react';

import type { RenderControlProps } from '@/types';

export interface EffectRenderProps
    extends Omit<RenderControlProps, 'speed' | 'worker' | 'createWorker'> {
    className?: string;
    style?: CSSProperties;
}
