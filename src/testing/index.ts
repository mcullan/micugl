/** @experimental */
export type {
    CanvasStubHandle,
    GLCall,
    GLStubConfig,
    GLStubHandle,
    PixelStoreCallRecord,
    TexImage2DCallRecord,
    TexSubImage2DCallRecord,
    UniformCallRecord
} from '@/testing/glStub';
/** @experimental */
export { createCanvasStub, createGLStub } from '@/testing/glStub';

/** @experimental */
export type {
    FrameSamplerHandle,
    FrameStats,
    GlCountersData,
    GlCountersHandle,
    InstrumentationHandle
} from '@/testing/glCounters';
/** @experimental */
export {
    installFrameSampler,
    installGlCounters,
    installInstrumentation,
    instrumentationInitScript
} from '@/testing/glCounters';

/** @experimental */
export {
    diffCounters,
    expectCounterDeltas,
    expectNoNewContexts,
    expectZeroCompiles,
    formatCounterDiff
} from '@/testing/assertions';

/** @experimental */
export const TESTING_API_UNSTABLE = true;
/** @experimental */
export const TESTING_API_VERSION = '0';
