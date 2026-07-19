/**
 * Typed façade handles — Option B of the domain-API decision (2026-07-19):
 * the clean OO surface over the data-first kit, with NO engine changes.
 *
 * ```ts
 * const t = erTable(api, 'ORDERS');
 * await t.rename('Sales Orders');
 * await t.columns.add({ name: 'status', type: 'varchar' }, { at: 2 });
 * await t.columns.get('customer_id')!.rename('cust_id');  // ports stay glued
 * t.onRowSelect(({ field }) => panel.show(field));
 * await t.undo();
 * ```
 *
 * THE DESIGN INVARIANT: a handle is STATELESS — nothing but `(api, id)`. Every
 * getter re-reads the live model (`metadata.kitEntity` / `kitClass`), so a
 * handle can never go stale across re-renders, undo, collab, or edits made
 * behind its back. Every mutation funnels through `updateEntity`/`updateClass`,
 * so one-step undo and field-port reconciliation are inherited, not
 * re-implemented. Inheritance lives HERE — `CardHandle → ErTable / UmlClass` —
 * where it is safe, never on the stored NodeModel (which the engine
 * reconstructs from data on undo/paste/collab; see the decision doc).
 */
import type { ErColumn, ErEntitySpec } from './er';
import type { UmlClassSpec } from './uml';
import { updateEntity, updateClass } from './update';
import type { RowRef } from './rows';

/** The slice of DiagramInstance the handles need (same shape update.ts uses). */
export interface HandleApi {
  container: HTMLElement;
  getModel(): {
    getNode(id: string):
      | {
          getMetadata?(key: string): unknown;
          size: { width: number; height: number };
          state?: { selected?: boolean };
        }
      | undefined;
    selectNode?(node: unknown): void;
  };
  getEngine?(): { undo(): Promise<void> | void; redo(): Promise<void> | void } | undefined;
  renderNow?(): void;
}

const deep = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export abstract class CardHandle {
  constructor(
    protected readonly api: HandleApi,
    readonly id: string
  ) {}

  /** The live node, or undefined once deleted. Handles never cache it. */
  protected liveNode() {
    return this.api.getModel().getNode(this.id);
  }

  get exists(): boolean {
    return this.liveNode() !== undefined;
  }

  /** Escape hatch to the underlying NodeModel (typed loosely on purpose). */
  get node(): unknown {
    return this.liveNode();
  }

  get width(): number {
    return this.liveNode()?.size.width ?? 0;
  }

  get height(): number {
    return this.liveNode()?.size.height ?? 0;
  }

  abstract get name(): string;
  /** Rename the card title — one undoable step. */
  abstract rename(name: string): Promise<boolean>;
  /** Resize the card — one undoable step (kit body scrolls when capped). */
  abstract resize(size: { width?: number; height?: number }): Promise<boolean>;

  select(): void {
    const model = this.api.getModel();
    const node = model.getNode(this.id);
    if (node) model.selectNode?.(node);
    this.api.renderNow?.();
  }

  async undo(): Promise<void> {
    await this.api.getEngine?.()?.undo();
    this.api.renderNow?.();
  }

  async redo(): Promise<void> {
    await this.api.getEngine?.()?.redo();
    this.api.renderNow?.();
  }

  /**
   * Row-selection events for THIS card only (the kit's `axk:row-select`,
   * filtered). ER cards resolve the selection to a typed {@link ErField} when
   * possible. Returns an unbind function.
   */
  onRowSelect(
    cb: (e: { field: ErField | null; selected: RowRef | null }) => void
  ): () => void {
    const handler = (event: Event): void => {
      const selected = (event as CustomEvent<{ selected: RowRef | null }>).detail?.selected ?? null;
      if (selected && selected.nodeId !== this.id) return; // another card
      if (!selected) {
        cb({ field: null, selected: null });
        return;
      }
      const field =
        this instanceof ErTable && selected.name !== undefined
          ? (this.columns.get(selected.name) ?? null)
          : null;
      cb({ field, selected });
    };
    this.api.container.addEventListener('axk:row-select', handler);
    return () => this.api.container.removeEventListener('axk:row-select', handler);
  }
}

// ---------------------------------------------------------------------------
// ER
// ---------------------------------------------------------------------------

/** A column of an {@link ErTable} — itself just (table, name): stateless. */
export class ErField {
  constructor(
    readonly table: ErTable,
    private readonly columnName: string
  ) {}

  private col(): ErColumn | undefined {
    return this.table.spec.columns.find((c) => c.name === this.columnName);
  }

  get exists(): boolean {
    return this.col() !== undefined;
  }
  get name(): string {
    return this.columnName;
  }
  get index(): number {
    return this.table.spec.columns.findIndex((c) => c.name === this.columnName);
  }
  get type(): string | undefined {
    return this.col()?.type;
  }
  get pk(): boolean {
    return this.col()?.pk === true;
  }
  get fk(): boolean {
    return this.col()?.fk === true;
  }

  /** Rename — the field port keeps its id, so attached edges stay glued. */
  rename(name: string): Promise<boolean> {
    return this.table.columns.renameAt(this.index, name);
  }

  setType(type: string): Promise<boolean> {
    return this.table.columns.patchAt(this.index, { type });
  }

  setKeys(keys: { pk?: boolean; fk?: boolean }): Promise<boolean> {
    return this.table.columns.patchAt(this.index, keys);
  }

  /** Remove this column (its ports and attached edges are dropped). */
  remove(): Promise<boolean> {
    return this.table.columns.removeAt(this.index);
  }
}

/** The columns collection of an {@link ErTable}. Iterable of {@link ErField}. */
export class ErColumnList implements Iterable<ErField> {
  constructor(private readonly table: ErTable) {}

  private cols(): ErColumn[] {
    return this.table.spec.columns;
  }

  get length(): number {
    return this.cols().length;
  }
  names(): string[] {
    return this.cols().map((c) => c.name);
  }
  at(index: number): ErField | undefined {
    const c = this.cols()[index];
    return c ? new ErField(this.table, c.name) : undefined;
  }
  get(name: string): ErField | undefined {
    return this.cols().some((c) => c.name === name) ? new ErField(this.table, name) : undefined;
  }
  [Symbol.iterator](): Iterator<ErField> {
    return this.cols()
      .map((c) => new ErField(this.table, c.name))
      [Symbol.iterator]();
  }

  add(column: ErColumn, opts: { at?: number } = {}): Promise<boolean> {
    const next = [...this.cols()];
    next.splice(opts.at ?? next.length, 0, { ...column });
    return this.table.update({ columns: next });
  }

  removeAt(index: number): Promise<boolean> {
    const next = this.cols().filter((_, i) => i !== index);
    return this.table.update({ columns: next });
  }

  renameAt(index: number, name: string): Promise<boolean> {
    return this.patchAt(index, { name });
  }

  patchAt(index: number, patch: Partial<ErColumn>): Promise<boolean> {
    const next = this.cols().map((c, i) => (i === index ? { ...c, ...patch } : c));
    return this.table.update({ columns: next });
  }

  move(from: number, to: number): Promise<boolean> {
    const next = [...this.cols()];
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    return this.table.update({ columns: next });
  }
}

export class ErTable extends CardHandle {
  readonly columns = new ErColumnList(this);

  /** A deep COPY of the stored entity spec — never a live reference. */
  get spec(): ErEntitySpec {
    const raw = this.liveNode()?.getMetadata?.('kitEntity') as ErEntitySpec | undefined;
    if (!raw) throw new Error(`erTable('${this.id}'): the node is gone`);
    return deep(raw);
  }

  get name(): string {
    return this.spec.name ?? this.id;
  }

  rename(name: string): Promise<boolean> {
    return this.update({ name });
  }

  resize(size: { width?: number; height?: number }): Promise<boolean> {
    return this.update(size);
  }

  /** The raw delta path — everything above funnels through here. */
  update(delta: Parameters<typeof updateEntity>[2]): Promise<boolean> {
    return updateEntity(this.api as never, this.id, delta);
  }
}

// ---------------------------------------------------------------------------
// UML
// ---------------------------------------------------------------------------

/** attributes / methods of a {@link UmlClass} (members are plain strings). */
export class UmlMemberList {
  constructor(
    private readonly cls: UmlClass,
    private readonly kind: 'attributes' | 'methods'
  ) {}

  list(): string[] {
    return this.cls.spec[this.kind] ?? [];
  }
  get length(): number {
    return this.list().length;
  }
  at(index: number): string | undefined {
    return this.list()[index];
  }

  add(member: string, opts: { at?: number } = {}): Promise<boolean> {
    const next = [...this.list()];
    next.splice(opts.at ?? next.length, 0, member);
    return this.cls.update({ [this.kind]: next });
  }
  removeAt(index: number): Promise<boolean> {
    return this.cls.update({ [this.kind]: this.list().filter((_, i) => i !== index) });
  }
  renameAt(index: number, member: string): Promise<boolean> {
    return this.cls.update({ [this.kind]: this.list().map((m, i) => (i === index ? member : m)) });
  }
}

export class UmlClass extends CardHandle {
  readonly attributes = new UmlMemberList(this, 'attributes');
  readonly methods = new UmlMemberList(this, 'methods');

  /** A deep COPY of the stored class spec — never a live reference. */
  get spec(): UmlClassSpec {
    const raw = this.liveNode()?.getMetadata?.('kitClass') as UmlClassSpec | undefined;
    if (!raw) throw new Error(`umlClass('${this.id}'): the node is gone`);
    return deep(raw);
  }

  get name(): string {
    return this.spec.name ?? this.id;
  }
  get abstract(): boolean {
    return this.spec.abstract === true;
  }
  get stereotype(): string | undefined {
    return this.spec.stereotype;
  }

  rename(name: string): Promise<boolean> {
    return this.update({ name });
  }
  resize(size: { width?: number; height?: number }): Promise<boolean> {
    return this.update(size);
  }
  setAbstract(abstract: boolean): Promise<boolean> {
    return this.update({ abstract });
  }
  setStereotype(stereotype: string | undefined): Promise<boolean> {
    return this.update({ stereotype });
  }

  update(delta: Parameters<typeof updateClass>[2]): Promise<boolean> {
    return updateClass(this.api as never, this.id, delta);
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function requireKit(api: HandleApi, id: string, key: 'kitEntity' | 'kitClass', what: string): void {
  const node = api.getModel().getNode(id);
  if (!node) throw new Error(`${what}('${id}'): no node with that id`);
  if (!node.getMetadata?.(key)) {
    throw new Error(`${what}('${id}'): that node is not an ${what === 'erTable' ? 'ER table' : 'UML class'} (missing metadata.${key})`);
  }
}

/** Typed handle for a kit ER table. Throws for unknown ids / non-kit nodes. */
export function erTable(api: HandleApi, id: string): ErTable {
  requireKit(api, id, 'kitEntity', 'erTable');
  return new ErTable(api, id);
}

/** Typed handle for a kit UML class. Throws for unknown ids / non-kit nodes. */
export function umlClass(api: HandleApi, id: string): UmlClass {
  requireKit(api, id, 'kitClass', 'umlClass');
  return new UmlClass(api, id);
}

/** Every kit ER table in the diagram, as handles. */
export function erTables(api: HandleApi): ErTable[] {
  const model = api.getModel() as unknown as { getNodes?: () => Array<{ id: string; getMetadata?: (k: string) => unknown }> };
  return (model.getNodes?.() ?? [])
    .filter((n) => n.getMetadata?.('kitEntity'))
    .map((n) => new ErTable(api, n.id));
}

/** Every kit UML class in the diagram, as handles. */
export function umlClasses(api: HandleApi): UmlClass[] {
  const model = api.getModel() as unknown as { getNodes?: () => Array<{ id: string; getMetadata?: (k: string) => unknown }> };
  return (model.getNodes?.() ?? [])
    .filter((n) => n.getMetadata?.('kitClass'))
    .map((n) => new UmlClass(api, n.id));
}
