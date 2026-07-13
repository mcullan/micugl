import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { getQueryString } from './scenes/query';

const strict = getQueryString('strict') === '1';

createRoot(document.getElementById('root')!).render(
    strict ? <StrictMode><App /></StrictMode> : <App />
);
