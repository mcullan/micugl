import { useState } from 'react';

import { PerformanceTest } from './PerformanceTest';

export const App = () => {
    const [showTest, setShowTest] = useState(true);
    const [iterations, setIterations] = useState(4);
    const [triggerRerender, setTriggerRerender] = useState(0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <div style={{ 
                padding: '12px 16px', 
                background: '#16213e',
                borderBottom: '1px solid #0f3460',
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }}>
                <h1 style={{ fontSize: '16px', fontWeight: 600 }}>micugl Performance Test</h1>
                
                <button 
                    type='button'
                    onClick={() => { setShowTest(s => !s) }}
                    style={{
                        padding: '6px 12px',
                        background: showTest ? '#e94560' : '#0f3460',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        cursor: 'pointer'
                    }}
                >
                    {showTest ? 'Unmount' : 'Mount'}
                </button>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Iterations:
                    <input 
                        type='range' 
                        min='1' 
                        max='16' 
                        value={iterations}
                        onChange={e => { setIterations(Number(e.target.value)) }}
                    />
                    <span style={{ minWidth: '20px' }}>{iterations}</span>
                </label>

                <button 
                    type='button'
                    onClick={() => { setTriggerRerender(n => n + 1) }}
                    style={{
                        padding: '6px 12px',
                        background: '#0f3460',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        cursor: 'pointer'
                    }}
                >
                    Force Parent Rerender ({triggerRerender})
                </button>

                <div style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.7 }}>
                    Open DevTools console to see debug logs
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                {showTest && (
                    <PerformanceTest 
                        iterations={iterations} 
                        parentRerenderCount={triggerRerender}
                    />
                )}
            </div>
        </div>
    );
};
