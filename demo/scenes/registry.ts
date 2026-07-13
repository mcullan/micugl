import type { ComponentType } from 'react';

import { AudioBars } from './AudioBars';
import { DevtoolsDebug } from './DevtoolsDebug';
import { ExportDemo } from './ExportDemo';
import { ImageTexture } from './ImageTexture';
import { InstancedParticles } from './InstancedParticles';
import { ManyCanvases } from './ManyCanvases';
import { ManyCanvasesDevtools } from './ManyCanvasesDevtools';
import { Offscreen } from './Offscreen';
import { ParticlesComponents } from './ParticlesComponents';
import { PingPongSim } from './PingPongSim';
import { getQueryString } from './query';
import { ReducedMotion } from './ReducedMotion';
import { RerenderStorm } from './RerenderStorm';
import { StaticIdle } from './StaticIdle';
import { Transitions } from './Transitions';
import { VisualFixed } from './VisualFixed';
import { WorkerContextLoss } from './WorkerContextLoss';
import { WorkerJank } from './WorkerJank';

export const scenes: Record<string, ComponentType> = {
    'rerender-storm': RerenderStorm,
    'pingpong-sim': PingPongSim,
    'static-idle': StaticIdle,
    'offscreen': Offscreen,
    'many-canvases': ManyCanvases,
    'many-canvases-devtools': ManyCanvasesDevtools,
    'devtools-debug': DevtoolsDebug,
    'reduced-motion': ReducedMotion,
    'transitions': Transitions,
    'audio-bars': AudioBars,
    'visual-fixed': VisualFixed,
    'export-demo': ExportDemo,
    'image-texture': ImageTexture,
    'instanced-particles': InstancedParticles,
    'particles-components': ParticlesComponents,
    'worker-jank': WorkerJank,
    'worker-context-loss': WorkerContextLoss
};

export const getSceneComponent = (): ComponentType | null => {
    const name = getQueryString('scene');
    if (name === null || !(name in scenes)) {
        return null;
    }
    return scenes[name];
};
