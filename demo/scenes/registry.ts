import type { ComponentType } from 'react';

import { ManyCanvases } from './ManyCanvases';
import { Offscreen } from './Offscreen';
import { PingPongSim } from './PingPongSim';
import { getQueryString } from './query';
import { RerenderStorm } from './RerenderStorm';
import { StaticIdle } from './StaticIdle';

export const scenes: Record<string, ComponentType> = {
    'rerender-storm': RerenderStorm,
    'pingpong-sim': PingPongSim,
    'static-idle': StaticIdle,
    'offscreen': Offscreen,
    'many-canvases': ManyCanvases
};

export const getSceneComponent = (): ComponentType | null => {
    const name = getQueryString('scene');
    if (name === null || !(name in scenes)) {
        return null;
    }
    return scenes[name];
};
