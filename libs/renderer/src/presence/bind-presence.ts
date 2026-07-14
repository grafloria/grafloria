// Wave 9 — Card 5, Part B: wiring presence to a LIVE diagram.
//
// THE FILE THIS CODEBASE WOULD OTHERWISE NOT HAVE.
//
// The signature bug of this engine, found in all eight previous waves, is MACHINERY WIRED
// TO NOTHING: a `setLayoutService()` nothing called, seventeen LOD presets that were all
// no-ops, a worker stack whose every test forced `useWorker:false`, a quality governor
// wired to nothing, and a `Command.serialize()` with no deserializer anywhere in the tree.
// Green tests, zero reachability, every time.
//
// A `PresenceOverlay` with a `setPeers()` method and a beautiful unit test is EXACTLY that
// shape. It renders cursors — if someone calls it. Nobody does. There is no cursor in the
// product and every test passes.
//
// So this is the wire, and it is deliberately the smallest possible amount of code:
//
//     pointermove  → world coords → adapter.setAwareness({ cursor })
//     selection    → ids          → adapter.setAwareness({ selection })
//     awareness    → change       → overlay.setPeers(...)
//
// and `presence-reachability.spec.ts` drives a REAL `createDiagram()` with REAL pointer
// events through a REAL SyncAdapter and asserts a cursor DOM element appears in the OTHER
// pane. If that test is deleted, this whole card is decoration.

import type { DiagramInstance } from '../instance/create-diagram';
import { PresenceOverlay, type PresencePeer } from './presence-overlay';
import { ROOT_CLASS } from '../instance/layers';

/**
 * What presence needs from a sync session — STRUCTURAL, not the concrete `SyncAdapter`.
 *
 * The renderer therefore gains no hard dependency on the sync layer, a host can drive
 * presence from its own backend (a Firebase channel, a Phoenix presence, a server-sent
 * event stream) without adopting our transport at all, and a test can hand it a fake. The
 * real `SyncAdapter` satisfies it exactly, which is what `presence-reachability.spec.ts`
 * proves.
 */
export interface PresenceSource {
  readonly actor: string;
  setAwareness(patch: Record<string, unknown>): void;
  readonly awareness: {
    getPeers(): Array<{ actor: string; state: Record<string, unknown> }>;
    onChange(listener: () => void): () => void;
  };
}

export interface BindPresenceOptions {
  /** Our own display name — what the OTHER peers put on our badge. */
  name?: string;
  /** Our own colour. Omit and one is derived deterministically from the actor id. */
  color?: string;
  /** Publish the local cursor. Off ⇒ we see others but they do not see us. */
  publishCursor?: boolean;
  /** Publish the local selection. */
  publishSelection?: boolean;
  /** Interpolation factor for remote cursors (0 = snap). */
  smoothing?: number;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface PresenceBinding {
  readonly overlay: PresenceOverlay;
  dispose(): void;
}

/**
 * Mount a presence overlay on a diagram and feed it from a sync session.
 *
 * ```ts
 * const diagram = createDiagram(el, { nodes, edges });
 * const session = createSyncSession(diagram.getModel(), transport, { actor: userId });
 * session.join();
 * bindPresence(diagram, session, { name: 'Ana' });
 * ```
 */
export function bindPresence(
  instance: DiagramInstance,
  source: PresenceSource,
  options: BindPresenceOptions = {}
): PresenceBinding {
  const container = instance.container;
  const root =
    (container.querySelector(`.${ROOT_CLASS}`) as HTMLElement | null) ?? container;
  const model = instance.getModel();

  const overlay = new PresenceOverlay({
    root,
    viewport: instance.viewport,
    smoothing: options.smoothing,
    requestFrame: options.requestFrame,
    cancelFrame: options.cancelFrame,
    // Where a remote selection's outline goes. Nodes and groups have a box; a LINK does not
    // (its geometry is a routed path), so it is skipped rather than outlined with a
    // fabricated rectangle — a box around a curve is worse than no box.
    getBounds: (id) => {
      const node = model.getNode(id);
      if (node) {
        return {
          x: node.position.x,
          y: node.position.y,
          width: node.size?.width ?? 0,
          height: node.size?.height ?? 0,
        };
      }
      return null;
    },
  });

  const unsubs: Array<() => void> = [];

  // -- identity ---------------------------------------------------------------
  // Sent once, on the first message, so peers have a name and a colour for us on the frame
  // they learn we exist — not five seconds later when we first twitch the mouse.
  const identity: Record<string, unknown> = {};
  if (options.name !== undefined) identity['name'] = options.name;
  if (options.color !== undefined) identity['color'] = options.color;
  if (Object.keys(identity).length > 0) source.setAwareness(identity);

  // -- awareness → overlay ----------------------------------------------------
  const repaint = (): void => {
    const peers: PresencePeer[] = source.awareness.getPeers().map((p) => ({
      actor: p.actor,
      name: p.state['name'] as string | undefined,
      color: p.state['color'] as string | undefined,
      cursor: p.state['cursor'] as { x: number; y: number } | null | undefined,
      selection: p.state['selection'] as string[] | undefined,
    }));
    overlay.setPeers(peers);
  };
  unsubs.push(source.awareness.onChange(repaint));
  repaint(); // peers who were already here before we bound

  // -- local pointer → awareness ----------------------------------------------
  if (options.publishCursor !== false) {
    const onPointerMove = (event: PointerEvent): void => {
      // WORLD coordinates, always. Screen coordinates would put my cursor wherever YOUR
      // camera happens to be pointing — so the moment either of us pans or zooms, every
      // remote cursor is in the wrong place, and it is wrong in a way that looks like a
      // rendering bug rather than a coordinate bug.
      const rect = container.getBoundingClientRect();
      const world = instance.viewport.clientToWorld(event.clientX, event.clientY, rect);
      source.setAwareness({ cursor: { x: Math.round(world.x), y: Math.round(world.y) } });
    };

    // The pointer left the canvas. `null` — not "the last place I saw it", which would leave
    // a cursor stuck to the edge of everyone's screen while its owner reads their email.
    const onPointerLeave = (): void => source.setAwareness({ cursor: null });

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    unsubs.push(() => {
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
    });
  }

  // -- local selection → awareness --------------------------------------------
  if (options.publishSelection !== false) {
    unsubs.push(
      instance.on('selection:change', ({ nodes, edges }) => {
        source.setAwareness({
          selection: [...nodes.map((n) => n.id), ...edges.map((e) => e.id)],
        });
      })
    );
  }

  // -- the model changed → a remote selection outline may have moved -----------
  // A peer selected a node, and then someone DRAGGED that node. The outline must follow it.
  // It is cheap (one style write per outlined entity) and it is NOT a diagram frame: it
  // repaints the overlay only, so the frame gate is not touched and an idle diagram with a
  // remote selection on it still costs nothing.
  const onModelChange = (): void => repaint();
  unsubs.push(instance.on('nodes:change', onModelChange));

  return {
    overlay,
    dispose(): void {
      for (const u of unsubs) u();
      unsubs.length = 0;
      overlay.dispose();
    },
  };
}
