import { Home } from './scenes/Home';
import { getSceneComponent } from './scenes/registry';

export const App = () => {
    const Scene = getSceneComponent();
    if (Scene) {
        return (
            <>
                <Scene />
                <a
                    href='./'
                    aria-label='Back to all scenes'
                    style={{
                        position: 'fixed',
                        top: '12px',
                        right: '12px',
                        zIndex: 9999,
                        padding: '6px 11px',
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        color: '#eee',
                        textDecoration: 'none',
                        background: 'rgba(15, 52, 96, 0.55)',
                        border: '1px solid rgba(233, 69, 96, 0.45)',
                        borderRadius: '7px',
                        backdropFilter: 'blur(6px)'
                    }}
                >
                    {'\u2039 scenes'}
                </a>
            </>
        );
    }
    return <Home />;
};
