import type { ComponentType } from 'react';

import { AudioBars } from './AudioBars';
import { DevtoolsDebug } from './DevtoolsDebug';
import { EffectsComposed } from './EffectsComposed';
import { EffectsGallery } from './EffectsGallery';
import { ExportDemo } from './ExportDemo';
import { GraphInspector } from './GraphInspector';
import { GraphPixels } from './GraphPixels';
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
import { RippleScene } from './Ripple';
import { ShaderGraph } from './ShaderGraph';
import { StaticIdle } from './StaticIdle';
import { Transitions } from './Transitions';
import { VisualFixed } from './VisualFixed';
import { Webcam } from './Webcam';
import { WorkerContextLoss } from './WorkerContextLoss';
import { WorkerJank } from './WorkerJank';

export const scenes: Record<string, ComponentType> = {
    'rerender-storm': RerenderStorm,
    'pingpong-sim': PingPongSim,
    'ripple': RippleScene,
    'static-idle': StaticIdle,
    'offscreen': Offscreen,
    'many-canvases': ManyCanvases,
    'many-canvases-devtools': ManyCanvasesDevtools,
    'devtools-debug': DevtoolsDebug,
    'reduced-motion': ReducedMotion,
    'transitions': Transitions,
    'audio-bars': AudioBars,
    'effects-gallery': EffectsGallery,
    'effects-composed': EffectsComposed,
    'visual-fixed': VisualFixed,
    'export-demo': ExportDemo,
    'image-texture': ImageTexture,
    'webcam': Webcam,
    'instanced-particles': InstancedParticles,
    'particles-components': ParticlesComponents,
    'worker-jank': WorkerJank,
    'worker-context-loss': WorkerContextLoss,
    'shader-graph': ShaderGraph,
    'graph-inspector': GraphInspector,
    'graph-pixels': GraphPixels
};

export const getSceneComponent = (): ComponentType | null => {
    const name = getQueryString('scene');
    if (name === null || !(name in scenes)) {
        return null;
    }
    return scenes[name];
};
