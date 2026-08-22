import { render } from '@grafloria/element';
import { makeScene } from './scene.js';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 500);
const { nodes, edges } = makeScene(N);

performance.mark('mount-start');
const api = render({ nodes, edges }, document.getElementById('root'));
api.renderNow();
api.fitView(20);
requestAnimationFrame(() => requestAnimationFrame(() => {
  performance.mark('mount-end');
  window.__mountMs = performance.measure('mount', 'mount-start', 'mount-end').duration;
  window.__api = api;
  window.__ready = true;
}));
