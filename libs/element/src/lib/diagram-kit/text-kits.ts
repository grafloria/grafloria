/**
 * Mermaid ER / class TEXT drawn as the kit diagrams (C9, docs review v3).
 *
 * `loadText('erDiagram …')` used to draw plain boxes and a plain arrow, and
 * `classDiagram` plain boxes with the inheritance arrow filled and at the child:
 * the parsed model carries the kit spec (`erSpec` / `umlSpec` diagram metadata,
 * via erSpecFrom/umlSpecFrom) but nothing on the text path ever drew it.
 *
 * These decorators run the SAME builders `erDiagram()` / `umlDiagram()` use and copy
 * their look onto the imported model IN PLACE: node ids, links, ports and the
 * grammar metadata exportText reads are untouched, so the text round-trips exactly
 * as before. Registered with the renderer's `loadText` on import of this package —
 * see `registerDiagramKitTextKits`.
 */
import { registerTextKit } from '@grafloria/renderer';
import type { DiagramModel, ErSpec, LinkModel, NodeModel, UmlSpec } from '@grafloria/engine';
import { erDiagram } from './er';
import { umlDiagram, multiplicityChip } from './uml';

type Spec = { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; finalize: (api: unknown) => void };

/** The kit node's look → the imported node (size, card html, kit metadata, hidden box). */
function adoptNodeLook(node: NodeModel, kitNode: Record<string, unknown>): void {
  const size = kitNode['size'] as { width: number; height: number } | undefined;
  if (size) node.setSize(size.width, size.height, node.size?.depth);
  const metadata = (kitNode['metadata'] ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(metadata)) node.setMetadata(key, value);
  if (kitNode['shape']) node.setMetadata('shape', kitNode['shape']);
  if (kitNode['style']) node.setStyle(kitNode['style'] as never);
}

/**
 * Pair each kit edge with the imported link for the same relationship. Both were
 * built in relationship order, but the import skips a relationship it could not
 * link — so pair by the (unordered) end pair, first-come first-served.
 */
function pairLinks(
  diagram: DiagramModel,
  edges: Array<Record<string, unknown>>
): Array<{ link: LinkModel; edge: Record<string, unknown>; index: number }> {
  const key = (a: unknown, b: unknown) => [String(a), String(b)].sort().join('\u0000');
  const queues = new Map<string, LinkModel[]>();
  for (const link of diagram.getLinks()) {
    const k = key(link.sourceNodeId, link.targetNodeId);
    const q = queues.get(k) ?? [];
    q.push(link);
    queues.set(k, q);
  }
  const pairs: Array<{ link: LinkModel; edge: Record<string, unknown>; index: number }> = [];
  edges.forEach((edge, index) => {
    const link = queues.get(key(edge['source'], edge['target']))?.shift();
    if (link) pairs.push({ link, edge, index });
  });
  return pairs;
}

/**
 * The kit edge's style on the imported link. The kit writes markers for ITS
 * direction (`from → to`, already flipped for Mermaid's arrowhead-first operators);
 * when the imported link runs the other way, the two ends swap.
 */
function adoptEdgeLook(link: LinkModel, edge: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  const style = { ...((edge['style'] ?? {}) as Record<string, unknown>), ...extra };
  if (edge['source'] !== link.sourceNodeId) {
    const { arrowHead, arrowTail } = style;
    style['arrowHead'] = arrowTail ?? { type: 'none', size: 0, filled: false };
    style['arrowTail'] = arrowHead ?? { type: 'none', size: 0, filled: false };
  }
  link.updateStyle(style as never);
}

function makeKit(build: (diagram: DiagramModel) => Spec | null, extraForEdge?: (index: number) => Record<string, unknown>, afterPair?: (link: LinkModel, edge: Record<string, unknown>, index: number) => void) {
  let last: Spec | null = null;
  return {
    decorate(diagram: DiagramModel): void {
      last = build(diagram);
      if (!last) return;
      for (const kitNode of last.nodes) {
        const node = diagram.getNode(String(kitNode['id']));
        if (node) adoptNodeLook(node, kitNode);
      }
      for (const { link, edge, index } of pairLinks(diagram, last.edges)) {
        adoptEdgeLook(link, edge, extraForEdge?.(index));
        afterPair?.(link, edge, index);
      }
    },
    finalize(instance: unknown): void {
      // Row interactions + the kit's own selection ring (no resize handles).
      last?.finalize(instance);
    },
  };
}

/** Imported positions, so the cards land where the text import laid them out. */
function positionOf(diagram: DiagramModel, id: string): { x: number; y: number } | undefined {
  const node = diagram.getNode(id);
  return node ? { x: node.position.x, y: node.position.y } : undefined;
}

let registered = false;

/** Register the ER and UML text kits with the renderer's `loadText`. Idempotent. */
export function registerDiagramKitTextKits(): void {
  if (registered) return;
  registered = true;

  let erRelationships: ErSpec['relationships'] = [];
  registerTextKit(
    'erDiagram',
    makeKit(
      (diagram) => {
        const spec = diagram.getMetadata('erSpec') as ErSpec | undefined;
        if (!spec) return null;
        erRelationships = spec.relationships;
        return erDiagram({
          entities: spec.entities.map((e) => ({ ...e, position: positionOf(diagram, e.id) })),
          relationships: spec.relationships.map((r) => ({
            from: r.from,
            to: r.to,
            ...(r.label ? { label: r.label } : {}),
            cardinality: { tail: r.cardinality.tail, head: r.cardinality.head },
          })),
        }) as Spec;
      },
      // Non-identifying (`..`) relationships are dashed, as Mermaid draws them.
      (index) => (erRelationships[index]?.dashed ? { strokeDasharray: '6 4' } : {})
    )
  );

  let umlRelationships: UmlSpec['relationships'] = [];
  registerTextKit(
    'classDiagram',
    makeKit(
      (diagram) => {
        const spec = diagram.getMetadata('umlSpec') as UmlSpec | undefined;
        if (!spec) return null;
        umlRelationships = spec.relationships;
        return umlDiagram({
          classes: spec.classes.map((c) => ({ ...c, position: positionOf(diagram, c.id) })),
          relationships: spec.relationships.map((r) => ({
            from: r.from,
            to: r.to,
            kind: r.kind,
            ...(r.label ? { label: r.label } : {}),
          })),
        }) as Spec;
      },
      undefined,
      // Multiplicities are positioned chips at the link's ends — in the IMPORTED
      // link's direction, which may be the reverse of the kit's.
      (link, edge, index) => {
        const m = umlRelationships[index]?.multiplicity;
        if (!m) return;
        const [atFrom, atTo] = edge['source'] === link.sourceNodeId ? m : [m[1], m[0]];
        if (atFrom) link.addLabel(multiplicityChip(atFrom, 'start') as never);
        if (atTo) link.addLabel(multiplicityChip(atTo, 'end') as never);
      }
    )
  );
}
