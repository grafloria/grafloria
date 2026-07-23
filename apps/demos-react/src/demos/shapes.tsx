import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerPathShape } from '@grafloria/element';
import { markReady } from '../ready';

// The 21 built-in figures — flowchart / BPMN / UML / ERD — all pre-registered.
const FIGURES = [
  'rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'parallelogram', 'parallelogram-top',
  'trapezoid', 'trapezoid-bottom', 'triangle', 'triangle-down', 'package', 'cube',
  'document', 'cylinder', 'cloud', 'predefined-process', 'component', 'note', 'terminal', 'actor',
];

// A five-point star, added as a custom silhouette through the public API.
const starPath = (w: number, h: number) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2, r = R * 0.42;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 ? r : R), ang = -Math.PI / 2 + i * Math.PI / 5;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2) + ' ';
  }
  return d + 'Z';
};
// Register the custom shape once, before any node that uses it paints.
registerPathShape('star', starPath);

const nodes = [...FIGURES, 'star'].map((type, i) => ({
  id: type,
  position: { x: 40 + (i % 6) * 200, y: 40 + Math.floor(i / 6) * 150 },
  size: { width: type === 'terminal' ? 170 : 130, height: 90 },
  label: type,
  shape: { type, fill: '#dbeafe', stroke: '#2563eb' },
}));
const edges: any[] = [];

/** All 21 built-in figures as full ShapeDefinitions, plus a custom star added
 *  through registerPathShape() — links attach to the real silhouette edge. */
export default function ShapesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
