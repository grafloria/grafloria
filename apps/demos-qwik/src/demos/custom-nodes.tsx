import { component$ } from '@builder.io/qwik';
import {
  GrafloriaFlow,
  type EdgeSpec,
  type NodeProps,
  type NodeSpec,
  type NodeTypes,
} from '@grafloria/qwik';

/**
 * Custom nodes — real Qwik components rendered into the diagram's HTML layer.
 *
 * Qwik has no portal primitive, so the wrapper mounts each one with Qwik's own
 * `render()`. The consequence is stated rather than hidden: a custom node lives
 * in its OWN Qwik container and cannot reach contexts provided by the
 * surrounding app. Feed it through `node.data`, as below.
 */
interface ServiceData {
  name: string;
  owner: string;
  status: 'healthy' | 'degraded';
}

const ServiceNode = component$((props: NodeProps<ServiceData>) => (
  <div
    class="service-node"
    style={{
      boxSizing: 'border-box',
      width: '100%',
      height: '100%',
      padding: '10px 12px',
      borderRadius: '10px',
      border: `2px solid ${props.data.status === 'healthy' ? '#059669' : '#d97706'}`,
      background: props.selected ? '#eef2ff' : '#ffffff',
      boxShadow: '0 1px 3px rgba(16,24,40,.12)',
      font: '13px/1.35 ui-sans-serif, system-ui, sans-serif',
      color: '#232A3D',
    }}
  >
    <div style={{ fontWeight: 600 }}>{props.data.name}</div>
    <div style={{ fontSize: '11px', color: '#6b7280' }}>{props.data.owner}</div>
    <div
      style={{
        marginTop: '6px',
        fontSize: '11px',
        fontWeight: 600,
        color: props.data.status === 'healthy' ? '#059669' : '#d97706',
      }}
    >
      {props.data.status}
    </div>
  </div>
));

// Declaring the type here IS the opt-in: specs with `type: 'service'` are
// flagged `custom` automatically, exactly like the Vue and Angular wrappers.
const nodeTypes = { service: ServiceNode } as unknown as NodeTypes;

const nodes: NodeSpec[] = [
  {
    id: 'gateway',
    type: 'service',
    position: { x: 80, y: 130 },
    size: { width: 190, height: 96 },
    data: { name: 'api-gateway', owner: 'platform', status: 'healthy' },
  },
  {
    id: 'orders',
    type: 'service',
    position: { x: 400, y: 50 },
    size: { width: 190, height: 96 },
    data: { name: 'orders-svc', owner: 'commerce', status: 'degraded' },
  },
  {
    id: 'billing',
    type: 'service',
    position: { x: 400, y: 220 },
    size: { width: 190, height: 96 },
    data: { name: 'billing-svc', owner: 'finance', status: 'healthy' },
  },
  { id: 'db', position: { x: 720, y: 135 }, size: { width: 170, height: 70 }, label: 'Postgres' },
];

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'gateway', target: 'orders', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'gateway', target: 'billing', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e3', source: 'orders', target: 'db', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e4', source: 'billing', target: 'db', sourceHandle: 'right', targetHandle: 'left' },
];

export default component$(() => (
  <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} nodeTypes={nodeTypes} fitView />
));
