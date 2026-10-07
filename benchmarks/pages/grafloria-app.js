import { render } from '@grafloria/element';
import { makeScene, sceneBounds } from './scene.js';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 500);
const { nodes, edges } = makeScene(N);

performance.mark('mount-start');
const api = render({ nodes, edges }, document.getElementById('root'));
api.renderNow();
api.fitView(20);
/**
 * Put the camera on an exact world rect. Both bench apps expose this with the
 * same signature so the harness can frame the two libraries identically instead
 * of trusting two different fitView policies to agree (they do not).
 */
window.__setCamera = ({ x, y, zoom }) => {
  api.viewport.setZoom(zoom);
  // The camera rect is canvas PIXELS around a centre; the visible world box is
  // that rect expanded by 1/zoom about the same centre. Solve for the centre
  // that puts world (x, y) at the top-left pixel.
  const v = api.viewport.getViewport();
  const cx = x + v.width / zoom / 2;
  const cy = y + v.height / zoom / 2;
  api.viewport.setViewport({ x: cx - v.width / 2, y: cy - v.height / 2, width: v.width, height: v.height });
};
window.__sceneBounds = sceneBounds(N);

requestAnimationFrame(() => requestAnimationFrame(() => {
  performance.mark('mount-end');
  window.__mountMs = performance.measure('mount', 'mount-start', 'mount-end').duration;
  window.__api = api;
  window.__ready = true;
}));
