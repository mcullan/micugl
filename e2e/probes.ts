export interface WorkerProbeData {
    urls: string[];
}

declare global {
    interface Window {
        __workerProbe: WorkerProbeData;
    }
}

export function installWorkerProbe(target: Window & typeof globalThis): WorkerProbeData {
    const urls: string[] = [];
    const OriginalWorker = target.Worker;

    class ProbedWorker extends OriginalWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
            urls.push(String(scriptURL));
            super(scriptURL, options);
        }
    }

    target.Worker = ProbedWorker;
    target.__workerProbe = { urls };

    return target.__workerProbe;
}

export const workerProbeInitScript = '(' + installWorkerProbe.toString() + ')(window);';
