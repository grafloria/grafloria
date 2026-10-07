import { render } from '@grafloria/element';

const api = render({
  nodes: [
    { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' } },
    { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
}, document.getElementById('canvas'));

// Drag nodes, draw connections between them, press Cmd/Ctrl+Z to undo.
// Next steps: https://grafloria.com/learn/javascript/
