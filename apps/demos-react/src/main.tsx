import { StrictMode, useEffect, useState, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ROUTES } from './routes';

// A tiny hash router — no router dependency: read the hash, lazy-load the
// matching demo, re-render on hashchange. Each route IS a demo, full-bleed;
// the gallery shell provides all chrome.
function currentRoute(): string {
  return location.hash.replace(/^#\/?/, '');
}

// The app's front door (/demos-react/ with no route): every demo, by category.
// It used to say "No demo at #/" — where the React page's "Open the demos" led.
const title = (route: string) => {
  const name = route.split('/')[1] ?? route;
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
};
function DemoIndex() {
  const groups = new Map<string, string[]>();
  for (const r of Object.keys(ROUTES)) {
    const cat = r.split('/')[0]!;
    groups.set(cat, [...(groups.get(cat) ?? []), r]);
  }
  return (
    <main style={{ padding: '28px 32px', maxWidth: 1040 }}>
      <h1 style={{ font: '700 22px/1.3 system-ui, sans-serif', margin: '0 0 6px' }}>Grafloria — React demos</h1>
      <p style={{ margin: '0 0 18px', color: '#5A6478' }}>
        Every gallery demo as a real React component. Pick one here, or open the <a href="../demos/">gallery</a> and press React on any page.
      </p>
      {[...groups].map(([cat, routes]) => (
        <section key={cat} style={{ marginBottom: 18 }}>
          <h2 style={{ font: '600 13px/1.4 system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em', color: '#5A6478', margin: '0 0 6px' }}>{cat}</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
            {routes.map((r) => <li key={r}><a href={'#/' + r}>{title(r)}</a></li>)}
          </ul>
        </section>
      ))}
    </main>
  );
}

function App() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  if (!route) return <DemoIndex />;
  const loader = ROUTES[route];
  if (!loader) return <div style={{ padding: 24 }}>No demo at #/{route}</div>;
  const Demo = lazy(loader as never);
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <Demo />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
