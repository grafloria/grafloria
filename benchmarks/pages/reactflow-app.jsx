import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { makeScene } from './scene.js';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 500);
const { nodes, edges } = makeScene(N);
const rfNodes = nodes.map((n) => ({ id: n.id, position: n.position, data: { label: n.data.label } }));
const rfEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));

performance.mark('mount-start');
createRoot(document.getElementById('root')).render(
  React.createElement('div', { style: { width: '100vw', height: '100vh' } },
    React.createElement(ReactFlow, {
      defaultNodes: rfNodes, defaultEdges: rfEdges, fitView: true,
      onInit: () => requestAnimationFrame(() => requestAnimationFrame(() => {
        performance.mark('mount-end');
        window.__mountMs = performance.measure('mount', 'mount-start', 'mount-end').duration;
        window.__ready = true;
      })),
    }))
);
