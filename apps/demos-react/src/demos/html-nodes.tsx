import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', type: 'card', position: { x: 80, y: 90 },  size: { width: 230, height: 110 },
    data: { title: 'Build', owner: 'CI', status: 'passing' } },
  { id: 'b', type: 'card', position: { x: 430, y: 90 }, size: { width: 230, height: 110 },
    data: { title: 'Deploy', owner: 'CD', status: 'ready' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Custom nodes THE REACT WAY: a component per node type, wired through
 *  nodeTypes — the node still hit-tests, routes and drags like any other. */
function Card({ data }: { data: any }) {
  return (
    <div style={{ height: '100%', background: '#fff', border: '1.5px solid #94A5F0', borderRadius: 12,
                  padding: '10px 14px', boxShadow: '0 2px 10px rgba(35,42,61,.08)', fontFamily: 'inherit', boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 700 }}>{data.title}</div>
      <div style={{ fontSize: 12, color: '#5A6478' }}>owner: {data.owner}</div>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5',
                     borderRadius: 999, padding: '1px 8px' }}>{data.status}</span>
    </div>
  );
}

export default function HtmlNodesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} nodeTypes={{ card: Card }} />
    </div>
  );
}
