import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { makeScene, sceneBounds } from './scene.js';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 500);
const { nodes, edges } = makeScene(N);
const rfNodes = nodes.map((n) => ({ id: n.id, position: n.position, data: { label: n.data.label } }));
const rfEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));

/** Same signature as the Grafloria app's — see the note there. */
function setCamera(rf) {
  window.__setCamera = ({ x, y, zoom }) => rf.setViewport({ x: -x * zoom, y: -y * zoom, zoom });
  window.__sceneBounds = sceneBounds(N);
  return true;
}

performance.mark('mount-start');
createRoot(document.getElementById('root')).render(
  React.createElement('div', { style: { width: '100vw', height: '100vh' } },
    React.createElement(ReactFlow, {
      defaultNodes: rfNodes, defaultEdges: rfEdges, fitView: true,
      // React Flow's default minZoom is 0.5, at which these scenes do not fit on
      // screen — fitView silently stops at 0.5 and leaves most of the mesh
      // outside the viewport. The harness pins both libraries to the SAME world
      // rect, and it cannot do that while one of them refuses to zoom out that
      // far. This raises no rendering limit and tunes nothing: it only lets the
      // camera go where the test puts it.
      minZoom: 0.02,
      // The instance is exposed ONLY so the harness can restore the camera
      // between scenarios (the pan leaves it somewhere else, and the drag has to
      // start from the same framing the mount produced). Setup, never measured —
      // Grafloria's app exposes its api for the identical reason.
      onInit: (rf) => (window.__rf = rf) && setCamera(rf) && requestAnimationFrame(() => requestAnimationFrame(() => {
        performance.mark('mount-end');
        window.__mountMs = performance.measure('mount', 'mount-start', 'mount-end').duration;
        window.__ready = true;
      })),
    }))
);
