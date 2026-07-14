// Incremental (diff) serialization — per-transaction deltas instead of full
// snapshots. The substrate for autosave, DB persistence, and multiplayer sync
// (GoJS's toIncrementalJson/applyIncrementalJson is the reference model).
//
// Capture side (this file): IncrementalCapture subscribes to a live diagram's
// event stream and coalesces mutations between commits into a patch:
//   - added:    full serialized entities (created since last commit)
//   - removed:  ids
//   - modified: full serialized entities (REPLACE semantics — deterministic,
//                and immune to the changeLog ring-buffer truncation that a
//                per-property delta would depend on)
//   - diagram:  name/viewport/metadata when they changed
// add+remove of the same entity within one window coalesces to a no-op.
//
// Apply side: DiagramModel.applyIncremental(patch) — lives on the model (it
// needs the private indices) and installs added entities through the SAME
// unified restore path as document load, updates modified entities IN PLACE
// (object identity preserved for renderers holding references), and fires
// normal change events so listeners repaint.

import type { DiagramModel } from '../models/DiagramModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import type { SerializedGroup } from '../models/GroupModel';
import type { SerializedStroke } from '../models/StrokeModel';
import { DIAGRAM_SCHEMA_VERSION } from './DiagramMigrations';

export const INCREMENTAL_FORMAT = 'grafloria-incremental' as const;

export interface DiagramIncremental {
  format: typeof INCREMENTAL_FORMAT;
  schemaVersion: number;
  /** diagram.version at the moment the window began (ordering hint). */
  baseVersion: number;
  /** diagram.version at commit — apply converges the replica's counter to it. */
  targetVersion: number;
  // wave10/whiteboard: `strokes` is OPTIONAL on each side, unlike the three original
  // collections. Not laziness — a patch is a hand-constructible value (the specs build
  // them literally, and so do hosts), and making it required would break every existing
  // caller for a key that is empty in almost every patch. Absent = "no ink changed".
  added: {
    nodes: SerializedNode[];
    links: SerializedLink[];
    groups: SerializedGroup[];
    strokes?: SerializedStroke[];
  };
  removed: { nodes: string[]; links: string[]; groups: string[]; strokes?: string[] };
  modified: {
    nodes: SerializedNode[];
    links: SerializedLink[];
    groups: SerializedGroup[];
    strokes?: SerializedStroke[];
  };
  diagram?: {
    name?: string;
    viewport?: { x: number; y: number; width: number; height: number; zoom: number };
    metadata?: Record<string, unknown>;
  };
}

type Ids = { added: Set<string>; removed: Set<string>; modified: Set<string> };
const emptyIds = (): Ids => ({ added: new Set(), removed: new Set(), modified: new Set() });

/**
 * Watches a live diagram and produces a DiagramIncremental per commit().
 * Continues capturing after commit (autosave-loop friendly) until stop().
 */
export class IncrementalCapture {
  private nodes: Ids = emptyIds();
  private links: Ids = emptyIds();
  private groups: Ids = emptyIds();
  private strokes: Ids = emptyIds(); // wave10/whiteboard
  private baseVersion: number;
  private nameSnapshot: string;
  private viewportSnapshot: string;
  private metadataSnapshot: string;
  private disposers: Array<() => void> = [];
  private groupDisposers = new Map<string, () => void>();
  private stopped = false;

  constructor(private readonly diagram: DiagramModel) {
    this.baseVersion = diagram.version;
    this.nameSnapshot = diagram.name;
    this.viewportSnapshot = JSON.stringify(diagram.viewport);
    this.metadataSnapshot = JSON.stringify(Object.fromEntries(diagram.metadata));

    const track = (ids: Ids) => ({
      added: (entity: { id: string }) => {
        if (ids.removed.has(entity.id)) {
          // removed then re-added inside one window = a modification
          ids.removed.delete(entity.id);
          ids.modified.add(entity.id);
        } else {
          ids.added.add(entity.id);
        }
      },
      removed: (entity: { id: string }) => {
        if (ids.added.has(entity.id)) {
          // add+remove inside one window coalesces to a no-op
          ids.added.delete(entity.id);
        } else {
          ids.removed.add(entity.id);
        }
        ids.modified.delete(entity.id);
      },
      changed: (entity: { id: string }) => {
        if (!ids.added.has(entity.id) && !ids.removed.has(entity.id)) {
          ids.modified.add(entity.id);
        }
      },
    });

    const n = track(this.nodes);
    const l = track(this.links);
    const g = track(this.groups);
    const s = track(this.strokes); // wave10/whiteboard

    this.disposers.push(
      // Ink. Strokes are immutable after commit (you draw one, you erase one — you do
      // not edit one point-by-point), so unlike groups there is no per-entity change
      // stream to watch. If stroke editing ever lands, it needs a watchStroke() exactly
      // like watchGroup() below, or the edit will not reach this channel.
      diagram.on('stroke:added', s.added),
      diagram.on('stroke:removed', s.removed),
      diagram.on('node:added', n.added),
      diagram.on('node:removed', n.removed),
      diagram.on('node:changed', n.changed),
      // moves/resizes are forwarded as dedicated events, not node:changed
      diagram.on('node:moved', ({ nodeId }: { nodeId: string }) => n.changed({ id: nodeId })),
      diagram.on('node:resized', ({ nodeId }: { nodeId: string }) => n.changed({ id: nodeId })),
      diagram.on('link:added', l.added),
      diagram.on('link:removed', l.removed),
      diagram.on('link:changed', l.changed),
      diagram.on('group:added', (group: { id: string }) => {
        g.added(group);
        this.watchGroup(group.id);
      }),
      diagram.on('group:removed', (group: { id: string }) => {
        g.removed(group);
        this.unwatchGroup(group.id);
      })
    );

    // Group mutations are NOT forwarded at diagram level — watch each group's
    // own change stream (and every group that appears while capturing).
    for (const group of diagram.getGroups()) {
      this.watchGroup(group.id);
    }
  }

  private watchGroup(groupId: string): void {
    if (this.groupDisposers.has(groupId)) return;
    const group = this.diagram.getGroup(groupId);
    if (!group) return;
    this.groupDisposers.set(
      groupId,
      group.on('change', () => {
        if (!this.groups.added.has(groupId) && !this.groups.removed.has(groupId)) {
          this.groups.modified.add(groupId);
        }
      })
    );
  }

  private unwatchGroup(groupId: string): void {
    this.groupDisposers.get(groupId)?.();
    this.groupDisposers.delete(groupId);
  }

  /** Anything captured since the window began? */
  hasChanges(): boolean {
    const any = (ids: Ids) => ids.added.size + ids.removed.size + ids.modified.size > 0;
    return (
      any(this.nodes) ||
      any(this.links) ||
      any(this.groups) ||
      any(this.strokes) ||
      this.diagramChanges() !== undefined
    );
  }

  private diagramChanges(): DiagramIncremental['diagram'] {
    const out: NonNullable<DiagramIncremental['diagram']> = {};
    if (this.diagram.name !== this.nameSnapshot) out.name = this.diagram.name;
    if (JSON.stringify(this.diagram.viewport) !== this.viewportSnapshot) {
      out.viewport = { ...this.diagram.viewport };
    }
    const metadata = Object.fromEntries(this.diagram.metadata);
    if (JSON.stringify(metadata) !== this.metadataSnapshot) out.metadata = metadata;
    return Object.keys(out).length ? out : undefined;
  }

  /**
   * Drain the window into a patch (null when nothing changed) and keep
   * capturing. Added/modified entities are serialized LIVE at commit time,
   * so intra-window churn costs nothing.
   */
  commit(): DiagramIncremental | null {
    if (this.stopped) {
      throw new Error('IncrementalCapture is stopped');
    }
    if (!this.hasChanges()) return null;

    const serializeNodes = (ids: Set<string>) =>
      [...ids]
        .map((id) => this.diagram.getNode(id)?.serialize())
        .filter((d): d is SerializedNode => !!d);
    const serializeLinks = (ids: Set<string>) =>
      [...ids]
        .map((id) => this.diagram.getLink(id)?.serialize())
        .filter((d): d is SerializedLink => !!d);
    const serializeGroups = (ids: Set<string>) =>
      [...ids]
        .map((id) => this.diagram.getGroup(id)?.serialize())
        .filter((d): d is SerializedGroup => !!d);
    const serializeStrokes = (ids: Set<string>) =>
      [...ids]
        .map((id) => this.diagram.getStroke(id)?.serialize())
        .filter((d): d is SerializedStroke => !!d);

    const patch: DiagramIncremental = {
      format: INCREMENTAL_FORMAT,
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
      baseVersion: this.baseVersion,
      targetVersion: this.diagram.version,
      added: {
        nodes: serializeNodes(this.nodes.added),
        links: serializeLinks(this.links.added),
        groups: serializeGroups(this.groups.added),
      },
      removed: {
        nodes: [...this.nodes.removed],
        links: [...this.links.removed],
        groups: [...this.groups.removed],
      },
      modified: {
        nodes: serializeNodes(this.nodes.modified),
        links: serializeLinks(this.links.modified),
        groups: serializeGroups(this.groups.modified),
      },
    };
    // wave10/whiteboard: written only when there IS ink in the window, so a patch from a
    // diagram nobody has drawn on is byte-identical to the one this class emitted before
    // this wave. (Same rule as the document's `strokes` key.)
    if (this.strokes.added.size) patch.added.strokes = serializeStrokes(this.strokes.added);
    if (this.strokes.removed.size) patch.removed.strokes = [...this.strokes.removed];
    if (this.strokes.modified.size) {
      patch.modified.strokes = serializeStrokes(this.strokes.modified);
    }

    const diagramDelta = this.diagramChanges();
    if (diagramDelta) patch.diagram = diagramDelta;

    // Reset the window IN PLACE — the event listeners hold references to
    // these exact Ids objects (bound in the constructor); reassigning would
    // orphan them and silently stop capture after the first commit.
    const resetIds = (ids: Ids) => {
      ids.added.clear();
      ids.removed.clear();
      ids.modified.clear();
    };
    resetIds(this.nodes);
    resetIds(this.links);
    resetIds(this.groups);
    resetIds(this.strokes);
    this.baseVersion = this.diagram.version;
    this.nameSnapshot = this.diagram.name;
    this.viewportSnapshot = JSON.stringify(this.diagram.viewport);
    this.metadataSnapshot = JSON.stringify(Object.fromEntries(this.diagram.metadata));

    return patch;
  }

  /** Unsubscribe everything. The capture cannot be reused afterwards. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    for (const dispose of this.groupDisposers.values()) dispose();
    this.groupDisposers.clear();
  }
}

/** Convenience: start watching a diagram for incremental commits. */
export function beginIncrementalCapture(diagram: DiagramModel): IncrementalCapture {
  return new IncrementalCapture(diagram);
}
