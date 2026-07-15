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
import { Performance } from './Performance';
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

export type SceneCategory =
    | 'performance'
    | 'simulation'
    | 'composition'
    | 'effects'
    | 'textures'
    | 'audio'
    | 'motion'
    | 'worker'
    | 'devtools';

export interface SceneMeta {
    component: ComponentType;
    title: string;
    category: SceneCategory;
    description: string;
}

export const scenes: Record<string, SceneMeta> = {
    'performance-test': {
        component: Performance,
        title: 'Performance Playground',
        category: 'performance',
        description: 'Mount, unmount, and force parent rerenders to watch the engine stay identity-stable.'
    },
    'rerender-storm': {
        component: RerenderStorm,
        title: 'Rerender Storm',
        category: 'performance',
        description: 'Parent rerenders never rebuild the GL engine.'
    },
    'static-idle': {
        component: StaticIdle,
        title: 'Static Idle',
        category: 'performance',
        description: 'An idle engine schedules zero frames.'
    },
    'offscreen': {
        component: Offscreen,
        title: 'Offscreen',
        category: 'performance',
        description: 'Engines pause when scrolled out of view.'
    },
    'many-canvases': {
        component: ManyCanvases,
        title: 'Many Canvases',
        category: 'performance',
        description: 'Dozens of independent engines on one page.'
    },
    'many-canvases-devtools': {
        component: ManyCanvasesDevtools,
        title: 'Many Canvases + Devtools',
        category: 'performance',
        description: 'The zero-cost devtools guard, at scale.'
    },
    'particles-components': {
        component: ParticlesComponents,
        title: 'Particle Components',
        category: 'performance',
        description: 'Instanced particles through the component API.'
    },
    'instanced-particles': {
        component: InstancedParticles,
        title: 'Instanced Particles',
        category: 'performance',
        description: 'A single instanced draw call. Set ?count= to scale.'
    },
    'pingpong-sim': {
        component: PingPongSim,
        title: 'Ping-Pong Simulation',
        category: 'simulation',
        description: 'FBO ping-pong feedback. Set ?iterations= for sub-steps.'
    },
    'shader-graph': {
        component: ShaderGraph,
        title: 'Shader Graph',
        category: 'composition',
        description: 'Compose multiple shader nodes into one DAG.'
    },
    'graph-inspector': {
        component: GraphInspector,
        title: 'Graph Inspector',
        category: 'composition',
        description: 'The devtools DAG panel over a live graph.'
    },
    'graph-pixels': {
        component: GraphPixels,
        title: 'Graph Pixels',
        category: 'composition',
        description: 'Per-node pixel readback from the graph.'
    },
    'effects-gallery': {
        component: EffectsGallery,
        title: 'Effects Gallery',
        category: 'effects',
        description: 'The built-in effect components, side by side.'
    },
    'effects-composed': {
        component: EffectsComposed,
        title: 'Composed Effects',
        category: 'effects',
        description: 'Chained effects with shared-program dedup.'
    },
    'ripple': {
        component: RippleScene,
        title: 'Ripple',
        category: 'effects',
        description: 'A feedback-accumulator ripple. Move the pointer to disturb it.'
    },
    'image-texture': {
        component: ImageTexture,
        title: 'Image Texture',
        category: 'textures',
        description: 'A static image bound as a shader sampler.'
    },
    'webcam': {
        component: Webcam,
        title: 'Webcam',
        category: 'textures',
        description: 'A live camera feed as a texture. Starts on click.'
    },
    'audio-bars': {
        component: AudioBars,
        title: 'Audio Bars',
        category: 'audio',
        description: 'Microphone levels driving shader uniforms. Starts on click.'
    },
    'reduced-motion': {
        component: ReducedMotion,
        title: 'Reduced Motion',
        category: 'motion',
        description: 'Honors prefers-reduced-motion with a static poster frame.'
    },
    'transitions': {
        component: Transitions,
        title: 'Uniform Transitions',
        category: 'motion',
        description: 'Tweened and spring uniform changes.'
    },
    'visual-fixed': {
        component: VisualFixed,
        title: 'Visual Fixed Frame',
        category: 'motion',
        description: 'A deterministic single frame. Set ?frame= to seek.'
    },
    'export-demo': {
        component: ExportDemo,
        title: 'Export',
        category: 'motion',
        description: 'Render to an image, an image sequence, or video.'
    },
    'worker-jank': {
        component: WorkerJank,
        title: 'Worker Jank',
        category: 'worker',
        description: 'Block the main thread; the worker canvas animates through it. ?mode=worker.'
    },
    'worker-context-loss': {
        component: WorkerContextLoss,
        title: 'Worker Context Loss',
        category: 'worker',
        description: 'Recover from a real GL context loss inside the worker.'
    },
    'devtools-debug': {
        component: DevtoolsDebug,
        title: 'Devtools Debug',
        category: 'devtools',
        description: 'The uniform inspector with scrub controls and overrides.'
    }
};

export const categoryLabels: Record<SceneCategory, string> = {
    performance: 'Performance',
    simulation: 'Simulation',
    composition: 'Composition',
    effects: 'Effects',
    textures: 'Textures',
    audio: 'Audio',
    motion: 'Motion & Capture',
    worker: 'Worker',
    devtools: 'Devtools'
};

export const categoryOrder: readonly SceneCategory[] = [
    'performance',
    'simulation',
    'composition',
    'effects',
    'textures',
    'audio',
    'motion',
    'worker',
    'devtools'
];

export const getSceneComponent = (): ComponentType | null => {
    const name = getQueryString('scene');
    if (name === null || !(name in scenes)) {
        return null;
    }
    return scenes[name].component;
};
