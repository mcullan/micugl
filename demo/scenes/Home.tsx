import type { SceneCategory, SceneMeta } from './registry';
import { categoryLabels, categoryOrder, scenes } from './registry';

const styles = `
.home-root {
    min-height: 100vh;
    background:
        radial-gradient(1200px 600px at 15% -10%, #16213e 0%, rgba(22, 33, 62, 0) 60%),
        radial-gradient(1000px 700px at 100% 0%, #0f3460 0%, rgba(15, 52, 96, 0) 55%),
        #1a1a2e;
}
.home-shell {
    max-width: 1120px;
    margin: 0 auto;
    padding: 72px 24px 96px;
}
.home-header {
    margin-bottom: 56px;
}
.home-eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #e94560;
    margin-bottom: 18px;
}
.home-wordmark {
    font-size: clamp(40px, 8vw, 68px);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    margin-bottom: 18px;
}
.home-wordmark span {
    color: #e94560;
}
.home-tagline {
    max-width: 46ch;
    font-size: 16px;
    line-height: 1.6;
    color: rgba(238, 238, 238, 0.68);
}
.home-section {
    margin-top: 48px;
}
.home-section-head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 18px;
}
.home-section-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #eee;
    white-space: nowrap;
}
.home-section-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(233, 69, 96, 0.35), rgba(15, 52, 96, 0.25));
}
.home-section-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: rgba(238, 238, 238, 0.45);
    white-space: nowrap;
}
.home-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
    gap: 14px;
}
.home-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px 18px 20px;
    background: rgba(22, 33, 62, 0.55);
    border: 1px solid rgba(15, 52, 96, 0.9);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}
.home-card:hover {
    transform: translateY(-3px);
    border-color: rgba(233, 69, 96, 0.7);
    background: rgba(22, 33, 62, 0.9);
}
.home-card:focus-visible {
    outline: 2px solid #e94560;
    outline-offset: 3px;
}
.home-card-slug {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: rgba(238, 238, 238, 0.4);
    overflow-wrap: anywhere;
}
.home-card-slug b {
    font-weight: 600;
    color: rgba(233, 69, 96, 0.85);
}
.home-card-title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
}
.home-card-desc {
    font-size: 13px;
    line-height: 1.55;
    color: rgba(238, 238, 238, 0.62);
}
@media (prefers-reduced-motion: reduce) {
    .home-card {
        transition: none;
    }
    .home-card:hover {
        transform: none;
    }
}
`;

const bucketScenes = (): Map<SceneCategory, [string, SceneMeta][]> => {
    const buckets = new Map<SceneCategory, [string, SceneMeta][]>();
    for (const [key, meta] of Object.entries(scenes)) {
        const bucket = buckets.get(meta.category);
        if (bucket) {
            bucket.push([key, meta]);
        } else {
            buckets.set(meta.category, [[key, meta]]);
        }
    }
    return buckets;
};

export const Home = () => {
    const buckets = bucketScenes();

    const rendered = categoryOrder.reduce(
        (sum, category) => sum + (buckets.get(category)?.length ?? 0),
        0
    );
    if (rendered !== Object.keys(scenes).length) {
        throw new Error(
            `Home gallery would drop scenes: ${String(rendered)} of ${String(Object.keys(scenes).length)} rendered. A scene category is missing from categoryOrder.`
        );
    }

    return (
        <main className='home-root'>
            <style>{styles}</style>
            <div className='home-shell'>
                <header className='home-header'>
                    <div className='home-eyebrow'>Demo scenes</div>
                    <h1 className='home-wordmark'>micu<span>gl</span></h1>
                    <p className='home-tagline'>
                        Live WebGL scenes built on the micugl React engine. Pick one to run it.
                    </p>
                </header>

                {categoryOrder.map(category => {
                    const bucket = buckets.get(category);
                    if (bucket === undefined) {
                        return null;
                    }
                    return (
                        <section className='home-section' key={category}>
                            <div className='home-section-head'>
                                <h2 className='home-section-label'>{categoryLabels[category]}</h2>
                                <span className='home-section-rule' />
                                <span className='home-section-count'>
                                    {bucket.length} {bucket.length === 1 ? 'scene' : 'scenes'}
                                </span>
                            </div>
                            <div className='home-grid'>
                                {bucket.map(([key, meta]) => (
                                    <a className='home-card' href={`?scene=${key}`} key={key}>
                                        <span className='home-card-slug'>?scene=<b>{key}</b></span>
                                        <span className='home-card-title'>{meta.title}</span>
                                        <span className='home-card-desc'>{meta.description}</span>
                                    </a>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </main>
    );
};
