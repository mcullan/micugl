import type { ComponentType } from 'react';

import { DevtoolsDebug } from './DevtoolsDebug';
import { ExportDemo } from './ExportDemo';
import { ManyCanvases } from './ManyCanvases';
import { ManyCanvasesDevtools } from './ManyCanvasesDevtools';
import { Offscreen } from './Offscreen';
import { PingPongSim } from './PingPongSim';
import { getQueryString } from './query';
import { ReducedMotion } from './ReducedMotion';
import { RerenderStorm } from './RerenderStorm';
import { StaticIdle } from './StaticIdle';
import { VisualFixed } from './VisualFixed';

export const scenes: Record<string, ComponentType> = {
    'rerender-storm': RerenderStorm,
    'pingpong-sim': PingPongSim,
    'static-idle': StaticIdle,
    'offscreen': Offscreen,
    'many-canvases': ManyCanvases,
    'many-canvases-devtools': ManyCanvasesDevtools,
    'devtools-debug': DevtoolsDebug,
    'reduced-motion': ReducedMotion,
    'visual-fixed': VisualFixed,
    'export-demo': ExportDemo
};

export const getSceneComponent = (): ComponentType | null => {
    const name = getQueryString('scene');
    if (name === null || !(name in scenes)) {
        return null;
    }
    return scenes[name];
};
