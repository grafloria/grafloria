/**
 * Card builders for the stencil palette — the bridge that finally lets a
 * dropped "Entity" or "Class" be a REAL kit card instead of a rectangle.
 *
 * Everything here is reuse. `entityCardContent` / `classCardContent` and their
 * auto-height helpers are the same functions `erDiagram()` / `umlDiagram()`
 * use, so a dropped card is byte-for-byte the card those kits produce — which
 * means the row-selection layer (`axk:row-select`), the inline editors and the
 * `erTable(api, id)` / `umlClass(api, id)` handles all work on it for free.
 *
 * The kit's own bindings are idempotent per container, so binding them again
 * after a drop is safe and is what makes the FIRST dropped card interactive on
 * a canvas that was never built by a kit.
 */
import { NodeModel } from '@grafloria/engine';
import {
  entityCardContent,
  entityAutoHeight,
  classCardContent,
  classAutoHeight,
  bindRowInteractions,
  bindCardEditing,
  ensureDiagramKitStyles,
} from '../diagram-kit';
import { registerStencilBuilder, type StencilBuildContext } from './builders';

/** Cards are transparent: the HTML body IS the card, the shape must not paint. */
const CARD_SHAPE = { type: 'rect', fill: 'none', stroke: 'none' };
const CARD_STYLE = { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** Turn the kit's card spec into a live node, and make the canvas interactive. */
function mountCard(
  ctx: StencilBuildContext,
  opts: { id: string; width: number; height: number; content: unknown; metaKey: string; spec: unknown }
): any {
  ensureDiagramKitStyles();
  const node = new NodeModel({
    id: opts.id,
    type: 'kit-card',
    position: { x: ctx.at.x, y: ctx.at.y },
    size: { width: opts.width, height: opts.height },
  });
  // The SAME metadata shape erDiagram()/umlDiagram() stamp — that is what the
  // row and editing layers key off.
  node.setMetadata('html', { content: opts.content, interactive: true });
  node.setMetadata(opts.metaKey, opts.spec);
  node.setMetadata('kitEditable', true);
  node.setMetadata('shape', CARD_SHAPE);
  node.setStyle?.(CARD_STYLE);

  ctx.api.getModel().addNode(node);

  // Bind the kit runtime for this container. Both are idempotent, so a canvas
  // that already ran a kit's finalize() is unaffected, and one that never did
  // becomes editable on the first drop.
  const container = ctx.api.container ?? ctx.api.getContainer?.();
  if (container) {
    const kitApi = { ...ctx.api, container };
    try { bindRowInteractions(kitApi as never); } catch { /* optional */ }
    try { bindCardEditing(kitApi as never); } catch { /* optional */ }
  }
  return node;
}

/** Register the built-in card builders (ER entity/table, UML classifiers). */
export function registerCardBuilders(): void {
  for (const masterId of ['erd-entity', 'erd-table', 'erd-associative-entity', 'erd-bridge-entity']) {
    registerStencilBuilder(masterId, (ctx) => {
      const id = nextId('entity');
      const spec = {
        id,
        name: (ctx.master as any).meta?.name ?? 'Entity',
        columns: [
          { name: 'id', type: 'uuid', pk: true },
          { name: 'name', type: 'varchar' },
        ],
      };
      return mountCard(ctx, {
        id,
        width: 220,
        height: entityAutoHeight(spec as never, true),
        content: entityCardContent(spec as never, true),
        metaKey: 'kitEntity',
        spec,
      });
    });
  }

  for (const masterId of ['uml-class', 'uml-abstract-class', 'uml-interface']) {
    registerStencilBuilder(masterId, (ctx) => {
      const id = nextId('class');
      const spec = {
        id,
        name: (ctx.master as any).meta?.name ?? 'Class',
        abstract: masterId === 'uml-abstract-class',
        stereotype: masterId === 'uml-interface' ? 'interface' : undefined,
        attributes: ['- field: Type'],
        methods: ['+ method(): void'],
      };
      return mountCard(ctx, {
        id,
        width: 220,
        height: classAutoHeight(spec as never, true),
        content: classCardContent(spec as never, true),
        metaKey: 'kitClass',
        spec,
      });
    });
  }
}
