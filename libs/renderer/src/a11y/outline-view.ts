import { type DiagramLike, diagramRoleDescription } from './semantics';
import { buildOutline, outlineSignature, type DiagramOutline, type OutlineNode } from './diagram-outline';

/**
 * The outline's DOM MIRROR: a visually-hidden, semantically-structured tree the
 * AT virtual cursor browses with its ordinary list/tree keys.
 *
 * Structure (all off-screen, never focusable by Tab — the canvas owns the tab
 * stop; this is virtual-cursor territory):
 *
 *   <div role="region" aria-label="Diagram outline">
 *     <p>{natural-language summary}</p>
 *     <ul role="tree">
 *       <li role="treeitem" aria-level=1 aria-label="Decision, Is order valid?, …">
 *         <ul role="group"> …children… </ul>
 *       </li>
 *     </ul>
 *     <ul role="list" aria-label="Edges"> … </ul>
 *   </div>
 *
 * THRASH CONTROL — the non-negotiable. `update()` is safe to call on every
 * frame: it recomputes only the outline SIGNATURE (ids/names/states/endpoints,
 * never geometry) and returns immediately when it is unchanged. A quiet frame,
 * and a pure-drag frame, do ZERO DOM work. `getRebuildCount()` exists so a test
 * can PROVE it rather than trust it.
 *
 * Wave 6 (a11y card 6).
 */

export interface OutlineViewOptions {
  /** Accessible name of the outline region. */
  label?: string;
  /** Diagram type, used in the roledescription ("Flowchart diagram"). */
  diagramType?: string;
  /** Include the per-edge list. Default true. */
  includeEdgeList?: boolean;
}

/** The visually-hidden recipe. Off-screen, but still rendered — so AT reads it.
 *  `display:none` / `visibility:hidden` would REMOVE it from the a11y tree,
 *  which is the classic way to ship an outline that no screen reader can see. */
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

export class DiagramOutlineView {
  private readonly root: HTMLElement;
  private readonly summaryEl: HTMLParagraphElement;
  private readonly treeEl: HTMLUListElement;
  private readonly edgeListEl: HTMLUListElement;
  private readonly options: Required<OutlineViewOptions>;

  private signature: string | null = null;
  private outline: DiagramOutline | null = null;
  private rebuilds = 0;

  constructor(container: HTMLElement, options: OutlineViewOptions = {}) {
    this.options = {
      label: options.label ?? 'Diagram outline',
      diagramType: options.diagramType ?? '',
      includeEdgeList: options.includeEdgeList ?? true,
    };

    const doc = container.ownerDocument;

    this.root = doc.createElement('div');
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', this.options.label);
    this.root.setAttribute('data-grafloria-outline', '');
    this.root.setAttribute('style', VISUALLY_HIDDEN);

    this.summaryEl = doc.createElement('p');
    this.summaryEl.setAttribute('data-grafloria-outline-summary', '');

    this.treeEl = doc.createElement('ul');
    this.treeEl.setAttribute('role', 'tree');
    this.treeEl.setAttribute('aria-label', 'Diagram structure');

    this.edgeListEl = doc.createElement('ul');
    this.edgeListEl.setAttribute('role', 'list');
    this.edgeListEl.setAttribute('aria-label', 'Edges');

    this.root.appendChild(this.summaryEl);
    this.root.appendChild(this.treeEl);
    if (this.options.includeEdgeList) this.root.appendChild(this.edgeListEl);

    container.appendChild(this.root);
  }

  /** The hidden region, for tests and hosts that want to relocate it. */
  getElement(): HTMLElement {
    return this.root;
  }

  /** How many times the DOM has actually been rebuilt. The thrash proof. */
  getRebuildCount(): number {
    return this.rebuilds;
  }

  /** The outline currently mirrored (null before the first update). */
  getOutline(): DiagramOutline | null {
    return this.outline;
  }

  /**
   * Sync the mirror to the model. Cheap and idempotent: returns false — having
   * touched no DOM — when the topology-relevant signature is unchanged.
   */
  update(diagram: DiagramLike | undefined): boolean {
    if (!diagram) return false;

    const signature = outlineSignature(diagram);
    if (signature === this.signature) return false;

    this.signature = signature;
    this.outline = buildOutline(diagram);
    this.rebuilds++;
    this.render(this.outline);
    return true;
  }

  private render(outline: DiagramOutline): void {
    const doc = this.root.ownerDocument;

    this.root.setAttribute('aria-roledescription', diagramRoleDescription(this.options.diagramType));
    this.summaryEl.textContent = outline.summary;

    this.treeEl.replaceChildren();
    for (const node of outline.roots) {
      this.treeEl.appendChild(this.renderNode(doc, node, 1));
    }

    if (!this.options.includeEdgeList) return;

    this.edgeListEl.replaceChildren();
    for (const edge of outline.edges) {
      const li = doc.createElement('li');
      li.setAttribute('role', 'listitem');
      li.setAttribute('data-grafloria-outline-edge', edge.linkId);
      li.textContent = edge.text;
      this.edgeListEl.appendChild(li);
    }
  }

  private renderNode(doc: Document, node: OutlineNode, level: number): HTMLLIElement {
    const li = doc.createElement('li');
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(level));
    li.setAttribute('data-grafloria-outline-node', node.nodeId);
    li.setAttribute('aria-label', outlineNodeLabel(node));

    // The node's own line, then where it leads — as a nested list, so the AT
    // user can dive into "what does this lead to?" or skip past it entirely.
    const line = doc.createElement('span');
    line.textContent = outlineNodeLabel(node);
    li.appendChild(line);

    if (node.targets.length > 0) {
      const targets = doc.createElement('ul');
      targets.setAttribute('role', 'list');
      targets.setAttribute('aria-label', `Leads to, from ${node.name}`);
      for (const target of node.targets) {
        const item = doc.createElement('li');
        item.setAttribute('role', 'listitem');
        item.setAttribute('data-grafloria-outline-target', target.linkId);
        item.textContent = targetLabel(target);
        targets.appendChild(item);
      }
      li.appendChild(targets);
    }

    if (node.children.length > 0) {
      const group = doc.createElement('ul');
      group.setAttribute('role', 'group');
      for (const child of node.children) {
        group.appendChild(this.renderNode(doc, child, level + 1));
      }
      li.appendChild(group);
    }

    return li;
  }

  dispose(): void {
    this.root.remove();
    this.outline = null;
    this.signature = null;
  }
}

/** "Decision, Is order valid?, node 3 of 12, 1 incoming, 2 outgoing, in a loop" */
export function outlineNodeLabel(node: OutlineNode): string {
  const bits = [
    node.roleDescription,
    node.name,
    `node ${node.index} of ${node.total}`,
    `${node.incoming} incoming`,
    `${node.outgoing} outgoing`,
  ];
  if (node.isEntryPoint) bits.push('start of a flow');
  if (node.isTerminal) bits.push('end of a flow');
  if (node.isIsolated) bits.push('disconnected');
  if (node.inCycle) bits.push('in a loop');
  return bits.join(', ');
}

function targetLabel(target: { targetName: string; label?: string; closesCycle: boolean }): string {
  const bits = [`leads to ${target.targetName}`];
  if (target.label) bits.push(`when ${target.label}`);
  if (target.closesCycle) bits.push('closing a loop');
  return bits.join(', ');
}
