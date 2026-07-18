/**
 * Live editing — `updateEntity` / `updateClass` mutate a rendered kit card in
 * place (P3, the foundation the in-canvas editing chrome is built on).
 *
 * A delta changes the DATA (a table's name, its columns; a class's name,
 * attributes, methods, width/height) and this module:
 *   1. reads the stored spec (`kitEntity` / `kitClass`) — the source of truth;
 *   2. applies the delta to a NEW spec (the caller's objects are never mutated,
 *      so undo can restore the old one cleanly);
 *   3. regenerates the card html from the SAME builder er.ts/uml.ts use
 *      (`card.ts`), so an edited card is identical to a freshly-built one;
 *   4. recomputes the node size;
 *   5. RECONCILES the field ports — every port pinned to a surviving column
 *      moves to that column's new row (`erRowCenterY`), ports on a removed
 *      column are dropped along with their edges. Port ids never change, so an
 *      edge stays glued to its row across inserts/removes/reorders (the exact
 *      failure this solves: a port frozen at the old row while the rows shifted
 *      under it);
 *   6. repaints — as ONE undoable step.
 *
 * ONE UNDO STEP. The change is applied through `api.getEngine().commandManager`
 * — the same public seam `renderer/ext/public-api.ts` uses — wrapped in a
 * single kit-local {@link Command}. There is no `SetNodeMetadataCommand` in the
 * engine (the html/kit-spec mutation has no built-in command), so rather than
 * reach into engine internals or compose a half-undoable macro, the whole edit
 * lives in one Command subclass here (subclassing `Command` is the engine's
 * intended extension point — every basic command does it). When no engine is
 * present the edit still applies, just non-undoably.
 */

import { Command, PortModel, LinkModel } from '@grafloria/engine';
import type { ErColumn, ErEntitySpec } from './er';
import type { UmlClassSpec } from './uml';
import {
  entityCardContent,
  entityAutoHeight,
  classCardContent,
  classAutoHeight,
  erRowCenterY,
  rowIndexFromY,
  matchColumns,
  type HtmlNode,
} from './card';

/** What an ER table edit can change. Omitted fields are left as they were. */
export interface ErEntityDelta {
  name?: string;
  width?: number;
  height?: number;
  /**
   * The NEW full column list. Survivors are matched to the old columns to move
   * their ports (object identity → name → positional remainder), so a rename,
   * a retype, a reorder, an insert and a delete are all understood without the
   * caller preserving object references. See {@link matchColumns}.
   */
  columns?: ErColumn[];
}

/** What a UML class edit can change. */
export interface UmlClassDelta {
  name?: string;
  stereotype?: string;
  abstract?: boolean;
  width?: number;
  height?: number;
  attributes?: string[];
  methods?: string[];
}

type Kind = 'er' | 'uml';

/** What building the new card produces; the command turns it into model mutations. */
interface BuildResult {
  newKit: Record<string, unknown>;
  content: HtmlNode;
  height: number;
  /** Undefined → keep the node's current width. */
  width?: number;
}

// -- the minimal live-model surface the command drives ----------------------
interface LivePort {
  id: string;
  offset?: { x: number; y: number };
  alignment?: { side?: string };
  layout?: { strategy?: string; args?: { units?: string; x?: number; y?: number; dy?: number } };
  serialize(): Record<string, unknown>;
  setOffset(o: { x: number; y: number }): void;
}
interface LiveLink {
  id: string;
  sourcePortId?: string;
  targetPortId?: string;
  serialize(): Record<string, unknown>;
}
interface LiveNode {
  size: { width: number; height: number };
  getMetadata(key: string): unknown;
  setMetadata(key: string, value: unknown): void;
  setSize(w: number, h: number): void;
  getPorts(): LivePort[];
  getPort(id: string): LivePort | undefined;
  addPort(p: unknown): void;
  removePort(id: string): unknown;
}
interface LiveModel {
  getNode(id: string): LiveNode | undefined;
  getLinks(): LiveLink[];
  getLink(id: string): LiveLink | undefined;
  removeLink(id: string): unknown;
  addLink(l: unknown): void;
}
interface KitApi {
  getModel?: () => LiveModel;
  getEngine?: () => { commandManager?: { execute: (c: unknown) => Promise<void> } } | undefined;
  renderNow?: () => void;
}

/**
 * The single undoable edit. Captures the card's whole before-state on first
 * execute and restores it on undo, so an edit — however many rows and edges it
 * touched — is one Ctrl+Z.
 */
class UpdateCardCommand extends Command {
  private captured = false;
  private before?: {
    html: unknown;
    kit: unknown;
    size: { width: number; height: number };
    ports: Array<Record<string, unknown>>;
    links: Array<Record<string, unknown>>;
  };

  constructor(
    private nodeId: string,
    private kind: Kind,
    private build: (oldKit: Record<string, unknown>) => BuildResult
  ) {
    super(kind === 'er' ? 'Edit table' : 'Edit class');
  }

  override execute(context: { diagram: LiveModel }): void {
    const model = context.diagram;
    const node = model.getNode(this.nodeId);
    if (!node) return;
    const kitKey = this.kind === 'er' ? 'kitEntity' : 'kitClass';
    const oldKit = (node.getMetadata(kitKey) ?? {}) as Record<string, unknown>;

    if (!this.captured) {
      this.captured = true;
      this.before = {
        html: node.getMetadata('html'),
        kit: oldKit,
        size: { ...node.size },
        ports: node.getPorts().map((p) => p.serialize()),
        links: [],
      };
    }

    const result = this.build(oldKit);
    const newWidth = result.width ?? node.size.width;

    const removedLinks: Array<Record<string, unknown>> = [];
    if (this.kind === 'er') {
      const oldCols = (oldKit['columns'] ?? []) as ErColumn[];
      const newCols = (result.newKit['columns'] ?? []) as ErColumn[];
      const map = matchColumns(oldCols, newCols);

      for (const port of [...node.getPorts()]) {
        const args = port.layout?.args;
        if (port.layout?.strategy !== 'absolute' || !args || args.units !== 'px' || args.y == null) continue;
        const oldIdx = rowIndexFromY(args.y);
        if (oldIdx < 0 || oldIdx >= oldCols.length) continue; // not a row-pinned field port
        const newIdx = map.get(oldIdx);
        if (newIdx === undefined) {
          // The column is gone — drop the port and every edge riding it.
          for (const link of model.getLinks()) {
            if (link.sourcePortId === port.id || link.targetPortId === port.id) removedLinks.push(link.serialize());
          }
          for (const link of model.getLinks().filter((l) => l.sourcePortId === port.id || l.targetPortId === port.id)) {
            model.removeLink(link.id);
          }
          node.removePort(port.id);
        } else {
          // Move the port to its column's NEW row; keep the ±dy spread. x tracks
          // the (possibly changed) width by side, so a widened table stays pinned.
          args.y = erRowCenterY(newIdx);
          const side = port.alignment?.side;
          args.x = side === 'left' ? 0 : side === 'right' ? newWidth : newWidth / 2;
          // A nested-arg mutation is not tracked — nudge the port so the model
          // marks it dirty and the renderer repositions it this frame.
          port.setOffset({ ...(port.offset ?? { x: 0, y: 0 }) });
        }
      }
    }

    node.setMetadata('html', { content: result.content, interactive: true });
    node.setMetadata(kitKey, result.newKit);
    node.setSize(newWidth, result.height);
    if (this.before) this.before.links = removedLinks;
  }

  override undo(context: { diagram: LiveModel }): void {
    const model = context.diagram;
    const node = model.getNode(this.nodeId);
    if (!node || !this.before) return;
    node.setMetadata('html', this.before.html);
    node.setMetadata(this.kind === 'er' ? 'kitEntity' : 'kitClass', this.before.kit);
    node.setSize(this.before.size.width, this.before.size.height);

    const beforeIds = new Set(this.before.ports.map((p) => p['id'] as string));
    for (const p of [...node.getPorts()]) if (!beforeIds.has(p.id)) node.removePort(p.id);
    for (const sp of this.before.ports) {
      const live = node.getPort(sp['id'] as string);
      if (live) {
        (live as { layout?: unknown }).layout = sp['layout'];
        live.setOffset({ ...((sp['offset'] as { x: number; y: number }) ?? { x: 0, y: 0 }) });
      } else {
        node.addPort(PortModel.fromJSON(sp as never));
      }
    }
    for (const sl of this.before.links) {
      if (!model.getLink(sl['id'] as string)) model.addLink(LinkModel.fromJSON(sl as never));
    }
  }

  override canExecute(context: { diagram: LiveModel }): boolean {
    return !!context.diagram?.getNode(this.nodeId);
  }

  override serialize() {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { nodeId: this.nodeId, kind: this.kind } };
  }
}

/** Route a build through the engine's command stack (one undo step) or apply it directly. */
async function runUpdate(api: KitApi, nodeId: string, kind: Kind, build: (oldKit: Record<string, unknown>) => BuildResult): Promise<boolean> {
  const model = api.getModel?.();
  const node = model?.getNode?.(nodeId);
  if (!model || !node) return false;
  const command = new UpdateCardCommand(nodeId, kind, build);
  const cm = api.getEngine?.()?.commandManager;
  if (cm?.execute) {
    await cm.execute(command); // ONE undoable step (Command enters history once)
  } else {
    command.execute({ diagram: model }); // no engine — apply, non-undoably
  }
  api.renderNow?.();
  return true;
}

const isEditable = (node: LiveNode | undefined): boolean => node?.getMetadata('kitEditable') === true;

/**
 * Edit a rendered ER table in place. `delta` may change the name, the column
 * list (add / remove / reorder / rename / retype), and the width/height. Field
 * ports and their edges are reconciled so the diagram stays correct, as ONE
 * undoable step.
 *
 * @returns whether the node existed and the edit was applied.
 */
export function updateEntity(api: KitApi, entityId: string, delta: ErEntityDelta): Promise<boolean> {
  const editable = isEditable(api.getModel?.()?.getNode?.(entityId));
  const build = (oldKit: Record<string, unknown>): BuildResult => {
    const newEntity = { ...(oldKit as unknown as ErEntitySpec) };
    if (delta.name !== undefined) newEntity.name = delta.name;
    if (delta.width !== undefined) newEntity.width = delta.width;
    if (delta.height !== undefined) newEntity.height = delta.height;
    if (delta.columns !== undefined) newEntity.columns = delta.columns;
    return {
      newKit: newEntity as unknown as Record<string, unknown>,
      content: entityCardContent(newEntity, editable),
      height: entityAutoHeight(newEntity, editable),
      width: newEntity.width,
    };
  };
  return runUpdate(api, entityId, 'er', build);
}

/**
 * Edit a rendered UML class in place. `delta` may change the name, stereotype,
 * abstract flag, attributes, methods, and width/height. One undoable step.
 */
export function updateClass(api: KitApi, classId: string, delta: UmlClassDelta): Promise<boolean> {
  const editable = isEditable(api.getModel?.()?.getNode?.(classId));
  const build = (oldKit: Record<string, unknown>): BuildResult => {
    const newClass = { ...(oldKit as unknown as UmlClassSpec) };
    if (delta.name !== undefined) newClass.name = delta.name;
    if (delta.stereotype !== undefined) newClass.stereotype = delta.stereotype;
    if (delta.abstract !== undefined) newClass.abstract = delta.abstract;
    if (delta.width !== undefined) newClass.width = delta.width;
    if (delta.height !== undefined) newClass.height = delta.height;
    if (delta.attributes !== undefined) newClass.attributes = delta.attributes;
    if (delta.methods !== undefined) newClass.methods = delta.methods;
    return {
      newKit: newClass as unknown as Record<string, unknown>,
      content: classCardContent(newClass, editable),
      height: classAutoHeight(newClass, editable),
      width: newClass.width,
    };
  };
  return runUpdate(api, classId, 'uml', build);
}

// -- small column helpers, for the editing chrome and embedders --------------

/** Append a column (immutably) — returns the new column array. */
export function addColumnAt(columns: ErColumn[], column: ErColumn, at = columns.length): ErColumn[] {
  const next = columns.slice();
  next.splice(Math.max(0, Math.min(at, next.length)), 0, column);
  return next;
}

/** Remove the column at `index` — returns the new column array. */
export function removeColumnAt(columns: ErColumn[], index: number): ErColumn[] {
  const next = columns.slice();
  next.splice(index, 1);
  return next;
}

/** Rename the column at `index` — returns a new array with a NEW object there. */
export function renameColumnAt(columns: ErColumn[], index: number, name: string): ErColumn[] {
  return columns.map((c, i) => (i === index ? { ...c, name } : c));
}
