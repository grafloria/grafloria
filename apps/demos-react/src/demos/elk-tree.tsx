import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = ['root', 'auth', 'api', 'login', 'tokens', 'users', 'billing'].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 130, height: 56 }, data: { label: id },
}));
const edges = [
  { id: 'e1', source: 'root', target: 'auth' },
  { id: 'e2', source: 'root', target: 'api' },
  { id: 'e3', source: 'auth', target: 'login' },
  { id: 'e4', source: 'auth', target: 'tokens' },
  { id: 'e5', source: 'api', target: 'users' },
  { id: 'e6', source: 'api', target: 'billing' },
];

/** Declarative auto-layout: layout="elk" — ELK loads lazily in a Worker and
 *  arranges the tree; you never position a node by hand. */
export default function ElkTreeDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} layout="elk" />
    </div>
  );
}
