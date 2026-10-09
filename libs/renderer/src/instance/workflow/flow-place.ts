/**
 * `api.tidy()` and `api.placeNodes()` — the engine's flow layout
 * (`flowLayout` / `placeFlowNodes`) fed from the live model, animated, and
 * committed as ONE undo step.
 *
 * Port order comes from the ports themselves: each link's `order` is its source
 * port's position down that step's side (top→bottom for a left-to-right flow,
 * left→right for a top-to-bottom one), so an If's `true` branch stays above its
 * `false` branch and a Switch's outputs stay in their rules' order. Nodes with no
 * link at all (sticky notes, labels) are never moved and are kept clear of.
 *
 * The motion is a tween of plain position writes; when it lands, the nodes are
 * put back where they started and ONE `MacroCommand` of `MoveNodeCommand`s moves
 * them to the end — so undo has exactly one entry, from the real start to the
 * real end. Reduced motion (or `animate: false`) skips the tween.
 */
import { MacroCommand, MoveNodeCommand, flowLayout, placeFlowNodes } from '@grafloria/engine';
import type { DiagramEngine, FlowBox, FlowEdge, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { getPortPositionForShape } from '../../svg/port-positioning';

type Pos = { x: number; y: number };

export interface FlowPlaceOptions {
  /** `'LR'` (default) or `'TB'`. */
  direction?: 'LR' | 'TB';
  /** Gap between consecutive steps along the flow. Default 80. */
  rankGap?: number;
  /** Gap between siblings across the flow. Default 40. */
  nodeGap?: number;
  /** Tween the move. Default true (off under `prefers-reduced-motion`). */
  animate?: boolean;
  /** Tween length in ms. Default 280. */
  duration?: number;
}

export interface PlaceNodesOptions extends FlowPlaceOptions {
  /** Place after this node (else after the first step that links into each new node). */
  after?: string;
}

/**
 * An ATTACHMENT: a node whose only links go into a port on the CROSS-axis side
 * of another (a model plugged into an AI step's slot underneath, in a
 * left-to-right flow). It is not a step of the flow: it stays out of the layout
 * and follows its host, keeping its offset.
 */
interface Attachment {
  host: string;
  dx: number;
  dy: number;
}

function flowInput(engine: DiagramEngine, lr: boolean): { boxes: FlowBox[]; edges: FlowEdge[]; linked: Set<string>; attached: Map<string, Attachment> } {
  const diagram = engine.getDiagram()!;
  const boxes: FlowBox[] = [];
  const linked = new Set<string>();
  const edges: FlowEdge[] = [];
  const crossSide = (side: string | undefined) => (lr ? side === 'top' || side === 'bottom' : side === 'left' || side === 'right');
  // Who is an attachment: every link it takes part in enters a cross-axis port of ONE host.
  const slotLinks = new Map<string, Set<string>>(); // source → hosts it plugs into
  const flowNodes = new Set<string>();
  for (const link of diagram.getLinks() as LinkModel[]) {
    const s = diagram.getNodeByPortId(link.sourcePortId);
    const t = diagram.getNodeByPortId(link.targetPortId);
    if (!s || !t) continue;
    const tp = t.getPort(link.targetPortId) as PortModel | undefined;
    if (crossSide(tp?.side)) {
      if (!slotLinks.has(s.id)) slotLinks.set(s.id, new Set());
      slotLinks.get(s.id)!.add(t.id);
      flowNodes.add(t.id);
    } else {
      flowNodes.add(s.id);
      flowNodes.add(t.id);
    }
  }
  const attached = new Map<string, Attachment>();
  for (const [id, hosts] of slotLinks) {
    if (flowNodes.has(id) || hosts.size !== 1) continue;
    const host = [...hosts][0]!;
    const a = diagram.getNode(id)!.position;
    const h = diagram.getNode(host)!.position;
    attached.set(id, { host, dx: a.x - h.x, dy: a.y - h.y });
  }
  for (const link of diagram.getLinks() as LinkModel[]) {
    const s = diagram.getNodeByPortId(link.sourcePortId);
    const t = diagram.getNodeByPortId(link.targetPortId);
    if (!s || !t || attached.has(s.id)) continue;
    linked.add(s.id);
    linked.add(t.id);
    const port = s.getPort(link.sourcePortId) as PortModel | undefined;
    const local = port ? getPortPositionForShape(port, s) : { x: 0, y: 0 };
    edges.push({ source: s.id, target: t.id, order: lr ? local.y : local.x });
  }
  for (const node of diagram.getNodes() as NodeModel[]) {
    if (attached.has(node.id)) continue;
    const p = node.getWorldPosition();
    boxes.push({ id: node.id, width: node.size?.width ?? 0, height: node.size?.height ?? 0, x: p.x, y: p.y });
  }
  return { boxes, edges, linked, attached };
}

/** Each attachment goes where its host went, at the offset it had. */
function carryAttachments(targets: Map<string, Pos>, attached: Map<string, Attachment>): Map<string, Pos> {
  for (const [id, a] of attached) {
    const host = targets.get(a.host);
    if (host) targets.set(id, { x: host.x + a.dx, y: host.y + a.dy });
  }
  return targets;
}

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Tween to `targets`, then commit start→end as one undo step. Resolves the ids that moved. */
async function commit(engine: DiagramEngine, targets: Map<string, Pos>, starts: Map<string, Pos>, name: string, options: FlowPlaceOptions, schedule: () => void): Promise<string[]> {
  const diagram = engine.getDiagram()!;
  const moving = [...targets].filter(([id, to]) => {
    const node = diagram.getNode(id);
    if (!node) return false;
    const from = node.position;
    return Math.abs(from.x - to.x) > 0.01 || Math.abs(from.y - to.y) > 0.01 || starts.has(id);
  });
  if (moving.length === 0) return [];
  // The real starting positions (undo returns here), and where the tween begins.
  const origin = new Map(moving.map(([id]) => [id, { ...diagram.getNode(id)!.position }]));
  const animate = options.animate !== false && !reducedMotion() && typeof requestAnimationFrame === 'function';
  if (animate) {
    const duration = options.duration ?? 280;
    const begin = new Map(moving.map(([id]) => [id, starts.get(id) ?? origin.get(id)!]));
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - t, 3);
        for (const [id, to] of moving) {
          const from = begin.get(id)!;
          diagram.getNode(id)?.setPosition(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        }
        schedule();
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    for (const [id] of moving) {
      const o = origin.get(id)!;
      diagram.getNode(id)?.setPosition(o.x, o.y, o.z);
    }
  }
  const macro = new MacroCommand(name);
  for (const [id, to] of moving) {
    const o = origin.get(id)!;
    macro.addStep(new MoveNodeCommand(id, { x: to.x, y: to.y, z: o.z }, o, { mergeable: false }));
  }
  await engine.commandManager.execute(macro);
  schedule();
  return moving.map(([id]) => id);
}

/** Lay the whole flow out (port order kept, notes kept clear). One undo step. */
export async function tidyFlow(engine: DiagramEngine, options: FlowPlaceOptions, schedule: () => void): Promise<string[]> {
  if (!engine.getDiagram()) return [];
  const lr = (options.direction ?? 'LR') === 'LR';
  const { boxes, edges, linked, attached } = flowInput(engine, lr);
  const flow = boxes.filter((b) => linked.has(b.id));
  const obstacles = boxes.filter((b) => !linked.has(b.id)).map((b) => ({ x: b.x!, y: b.y!, width: b.width, height: b.height }));
  // A step with an attachment underneath needs that much more room across the flow.
  for (const [id, a] of attached) {
    const host = flow.find((b) => b.id === a.host);
    const node = engine.getDiagram()!.getNode(id)!;
    if (!host) continue;
    if (lr) host.height = Math.max(host.height, a.dy + (node.size?.height ?? 0));
    else host.width = Math.max(host.width, a.dx + (node.size?.width ?? 0));
  }
  const targets = carryAttachments(flowLayout(flow, edges, { direction: options.direction, rankGap: options.rankGap, nodeGap: options.nodeGap, obstacles }), attached);
  return commit(engine, targets, new Map(), 'Tidy flow', options, schedule);
}

/**
 * Place only `ids`, every other node stable: each beside its parent, in its
 * port's slot, nudged clear. New nodes slide out from their parent. One undo step.
 */
export async function placeFlow(engine: DiagramEngine, ids: string[], options: PlaceNodesOptions, schedule: () => void): Promise<string[]> {
  const diagram = engine.getDiagram();
  if (!diagram) return [];
  const lr = (options.direction ?? 'LR') === 'LR';
  const { boxes, edges, linked, attached } = flowInput(engine, lr);
  const fresh = new Set(ids);
  const obstacles = boxes.filter((b) => !linked.has(b.id) && !fresh.has(b.id)).map((b) => ({ x: b.x!, y: b.y!, width: b.width, height: b.height }));
  // Attachments are out of the layout, not out of the way: a new step must not land on one.
  for (const id of attached.keys()) {
    const node = diagram.getNode(id)!;
    const p = node.getWorldPosition();
    obstacles.push({ x: p.x, y: p.y, width: node.size?.width ?? 0, height: node.size?.height ?? 0 });
  }
  const targets = placeFlowNodes(ids, boxes.filter((b) => linked.has(b.id) || fresh.has(b.id)), edges, {
    direction: options.direction,
    rankGap: options.rankGap,
    nodeGap: options.nodeGap,
    after: options.after,
    obstacles,
  });
  carryAttachments(targets, attached);
  // Slide each new node out from its parent rather than from wherever it was made.
  const starts = new Map<string, Pos>();
  for (const id of targets.keys()) {
    const parentId = options.after ?? edges.find((e) => e.target === id && !fresh.has(e.source))?.source;
    const parent = parentId ? diagram.getNode(parentId) : undefined;
    if (parent) starts.set(id, { ...parent.position });
  }
  return commit(engine, targets, starts, 'Place nodes', options, schedule);
}
