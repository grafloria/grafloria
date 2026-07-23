import { StrictMode, useEffect, useState, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ROUTES } from './routes';

// A tiny hash router — no router dependency: read the hash, lazy-load the
// matching demo, re-render on hashchange. Each route IS a demo, full-bleed;
// the gallery shell provides all chrome.
function currentRoute(): string {
  return location.hash.replace(/^#\/?/, '');
}

function App() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
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
