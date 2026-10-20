/**
 * TAKING BACK A ROUTE A MERMAID IMPORT LAID OUT (dsl/mermaid/import-layout.ts).
 *
 * The import gives a link its layout's route: side-anchored ports, waypoints,
 * and its label pinned where the layout made room. All of it belongs to the
 * boxes where the import put them. When a box moves or resizes, an author pins
 * a side or draws bends, or another layout places the boxes, the link goes
 * back to exactly what it was before: its own ports, no waypoints, and its
 * label where it was — at its slot, or, for a label the route ADDED (a state
 * transition's, drawn before that from the link's metadata), gone again.
 * One home for this, so the model's move handling and the import's own
 * take-back can never restore different things.
 */
import type { DiagramModel } from './DiagramModel';
import type { LinkModel } from './LinkModel';
import type { LinkLabel, LinkStyle } from '../types/model.types';

/** What a link had before the import's route: stored on it by applyImportRoute. */
export interface ImportRouteOriginal {
  ports?: { source?: string; target?: string };
  /** The link's own `style.spline` (null: it had none); the route draws as a basis curve. */
  spline?: LinkStyle['spline'] | null;
  /** Each label's own slot, position and offset, in order; `added` when the route added the only label. */
  labels?: Array<{ slot?: LinkLabel['slot']; position?: number; offset?: LinkLabel['offset'] }>;
  added?: boolean;
}

export function dropImportRoute(link: LinkModel, diagram: DiagramModel): void {
  diagram.noteImportRoute(link.id, false);
  if (link.getMetadata('importRoute') !== true) return;
  link.setMetadata('importRoute', false);
  link.setMetadata('hasManualWaypoints', false);
  link.setMetadata('layoutAnchored', false);
  link.setPoints([]);
  const original = link.getMetadata('importOriginal') as ImportRouteOriginal | undefined;
  if (original && original.spline !== undefined) link.updateStyle({ spline: original.spline ?? undefined });
  for (const end of ['source', 'target'] as const) {
    const portId = original?.ports?.[end];
    const node = diagram.getNode((end === 'source' ? link.sourceNodeId : link.targetNodeId) ?? '');
    const current = end === 'source' ? link.sourcePortId : link.targetPortId;
    if (!portId || !node?.getPort(portId) || current === portId) continue;
    if (current) diagram.getPortById(current)?.removeConnection(link.id);
    if (end === 'source') link.setSourcePort(portId, node.id);
    else link.setTargetPort(portId, node.id);
    node.getPort(portId)!.addConnection(link.id, end);
  }
  if (original?.added) {
    link.setLabels([]);
  } else if (original?.labels && link.labels?.length) {
    link.setLabels(
      link.labels.map((label, i) => {
        const was = original.labels?.[i];
        if (!was) return label;
        const { slot: _slot, ...rest } = label;
        return { ...rest, ...(was.slot ? { slot: was.slot } : {}), position: was.position ?? 0.5, offset: was.offset ?? { x: 0, y: 0 } };
      })
    );
  }
}
