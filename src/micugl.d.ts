declare module 'micugl' {
    export * from './index';
    export * from './types';
  }

interface NetworkInformation {
    saveData?: boolean;
    addEventListener?: (type: 'change', listener: () => void) => void;
    removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface Navigator {
    connection?: NetworkInformation;
}
