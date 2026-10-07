import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { defineStyle } from '@grafloria/element';
import { markReady } from '../ready';

// The registry is a process-wide singleton, so namespace class names to this demo.
const WARN = 'nsc-warn';
const BOLD = 'nsc-bold';
/** Register the two named classes (idempotent). Called from the component body,
 *  not at module top level — this gallery keeps demo modules free of top-level
 *  side effects (Qwik's optimizer may drop or reorder them). */
function defineDemoStyles(): void {
  defineStyle(WARN, { fill: '#f97316', stroke: '#9a3412', strokeWidth: 2 });
  defineStyle(BOLD, { strokeWidth: 6 });
}

const nodes = [
  { id: 'classed', position: { x: 60, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'styleClass: warn' },
    style: { styleClass: WARN } },
  { id: 'override', position: { x: 320, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn + inline fill' },
    style: { styleClass: WARN, fill: '#22c55e' } },
  { id: 'stacked', position: { x: 580, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn bold' },
    style: { styleClass: `${WARN} ${BOLD}` } },
  { id: 'plain', position: { x: 320, y: 250 }, size: { width: 190, height: 78 }, data: { label: 'no class (theme)' } },
];
const edges: never[] = [];

/** defineStyle() + style.styleClass — one deterministic cascade:
 *  theme < type-default < named-class < element-inline < state. */
export default component$(() => {
  // Runs before <GrafloriaFlow>'s visible task creates the diagram, exactly as
  // the module-level registration does in the other frameworks' ports.
  defineDemoStyles();
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(() => markReady())} />
    </div>
  );
});
