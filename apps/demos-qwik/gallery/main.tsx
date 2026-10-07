import { render } from '@builder.io/qwik';
import { QWIK_LOADER } from '@builder.io/qwik/loader';
import { ROUTES } from './routes';

// Qwik dispatches DOM events (onClick$, onInput$, …) through its tiny loader
// script. A server-rendered page carries it; a client-only app must add it, or
// every handler is silently dead (found: buttons and inputs did nothing).
const loader = document.createElement('script');
loader.textContent = QWIK_LOADER;
document.head.appendChild(loader);

// A tiny hash router — no router dependency: read the hash, lazy-load the
// matching demo, render it full-bleed, re-render on hashchange. The gallery
// shell provides all chrome. Qwik's optimizer splits every component$ and $()
// into its own lazily loaded segment, exactly as in a consumer's app.
const root = document.getElementById('root')!;
let mounted: { cleanup(): void } | null = null;

async function show(): Promise<void> {
  const route = location.hash.replace(/^#\/?/, '');
  mounted?.cleanup();
  mounted = null;
  root.replaceChildren();
  if (!route) {
    showIndex();
    return;
  }
  const loader = ROUTES[route];
  if (!loader) {
    root.textContent = `No demo at #/${route}`;
    return;
  }
  const { default: Demo } = await loader();
  mounted = await render(root, <Demo />);
}

// The app's front door (/demos-qwik/ with no route): every demo, by category.
function showIndex(): void {
  const doc = root.ownerDocument;
  const el = (tag: string, style = '', text = '') => {
    const e = doc.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (text) e.textContent = text;
    return e;
  };
  const main = el('main', 'padding:28px 32px;max-width:1040px');
  main.append(el('h1', 'font:700 22px/1.3 system-ui,sans-serif;margin:0 0 6px', 'Grafloria — Qwik demos'));
  const intro = el('p', 'margin:0 0 18px;color:#5A6478', 'Every gallery demo as a real Qwik component. Pick one here, or open the ');
  const gallery = el('a', '', 'gallery') as HTMLAnchorElement;
  gallery.href = '../demos/';
  intro.append(gallery, ' and press Qwik on any page.');
  main.append(intro);
  const groups = new Map<string, string[]>();
  for (const r of Object.keys(ROUTES)) {
    const cat = r.split('/')[0]!;
    groups.set(cat, [...(groups.get(cat) ?? []), r]);
  }
  for (const [cat, routes] of groups) {
    const section = el('section', 'margin-bottom:18px');
    section.append(el('h2', 'font:600 13px/1.4 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#5A6478;margin:0 0 6px', cat));
    const list = el('ul', 'margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 18px');
    for (const r of routes) {
      const li = el('li');
      const name = r.split('/')[1] ?? r;
      const a = el('a', '', name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ')) as HTMLAnchorElement;
      a.href = '#/' + r;
      li.append(a);
      list.append(li);
    }
    section.append(list);
    main.append(section);
  }
  root.append(main);
}

addEventListener('hashchange', () => { show().catch((e) => console.error(e)); });
// NOT `void show()`: Qwik's optimizer drops a top-level `void` expression as
// dead code, and the first demo never rendered.
show().catch((e) => console.error(e));
