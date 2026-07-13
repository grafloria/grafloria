import type { DiagramEngine, NodeModel, LinkModel, Point } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';

/**
 * HighlighterController — hover / selection / validation / drop-target
 * decorations (Card 5, wave4/interaction).
 *
 * JointJS calls these "highlighters": decorations layered OVER an element rather
 * than baked into it. Keeping them out of the shape lets several stack (a node
 * can be selected AND invalid) and lets a host restyle them without touching the
 * node renderer.
 *
 * Like the rest of the interaction layer this class only produces geometry — it
 * never renders and never mutates the model.
 */

export type HighlighterKind = 'hover' | 'selection' | 'validation' | 'connect-target';

export interface Highlighter {
  /** Stable key for the host's keyed list. */
  id: string;
  kind: HighlighterKind;
  entity: 'node' | 'link';
  entityId: string;
  /** Node highlighters: the padded world box to outline. */
  bounds?: Rectangle;
  /** Node highlighters: rotation (deg) about the box centre. */
  rotation?: number;
  /** Link highlighters: the routed polyline to trace. */
  points?: Point[];
  severity?: 'error' | 'warning';
  /** Validation message (also the accessible description). */
  message?: string;
  /** Suggested CSS class, so a host can theme without re-deriving the kind. */
  className: string;
}

export interface HighlighterConfig {
  /** World padding around a node's box, per kind. */
  hoverPadding: number;
  selectionPadding: number;
  validationPadding: number;
  showHover: boolean;
  showSelection: boolean;
  showValidation: boolean;
  showConnectTargets: boolean;
}

export const DEFAULT_HIGHLIGHTER_CONFIG: HighlighterConfig = {
  hoverPadding: 2,
  selectionPadding: 4,
  validationPadding: 6,
  showHover: true,
  showSelection: true,
  showValidation: true,
  showConnectTargets: true,
};

/** One validation issue, resolved to the entity it is about. */
export interface ValidationIssue {
  entity: 'node' | 'link';
  entityId: string;
  severity: 'error' | 'warning';
  message: string;
  code: string;
}

/**
 * Parse a ValidationEngine `path` back to the entity it names.
 * Paths look like `node.<id>`, `node.<id>.port.<id>`, `node.<id>.hierarchy`,
 * `link.<id>`. Anything else (diagram-level) is not entity-scoped.
 */
export function parseValidationPath(
  path: string
): { entity: 'node' | 'link'; entityId: string } | null {
  const parts = (path ?? '').split('.');
  if (parts.length < 2) return null;
  if (parts[0] === 'node') return { entity: 'node', entityId: parts[1]! };
  if (parts[0] === 'link') return { entity: 'link', entityId: parts[1]! };
  return null;
}

export class HighlighterController {
  protected config: HighlighterConfig;
  /** entityId → issues; refreshed by {@link refreshValidation}. */
  protected issues = new Map<string, ValidationIssue[]>();

  constructor(config: Partial<HighlighterConfig> = {}) {
    this.config = { ...DEFAULT_HIGHLIGHTER_CONFIG, ...config };
  }

  getConfig(): HighlighterConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<HighlighterConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Run the engine's validation once and cache the per-entity issues.
   *
   * Called on structure changes (node/link added/removed/reconnected) — NOT per
   * frame: `validateDiagram()` walks every node, link, hierarchy and group.
   */
  refreshValidation(engine: DiagramEngine): ValidationIssue[] {
    this.issues.clear();
    const result = engine?.validateDiagram?.();
    if (!result) return [];

    const all: ValidationIssue[] = [];
    const push =
      (severity: 'error' | 'warning') =>
      (raw: { path: string; message: string; code: string }) => {
        const target = parseValidationPath(raw.path);
        if (!target) return;
        const issue: ValidationIssue = {
          entity: target.entity,
          entityId: target.entityId,
          severity,
          message: raw.message,
          code: raw.code,
        };
        all.push(issue);
        const list = this.issues.get(target.entityId) ?? [];
        list.push(issue);
        this.issues.set(target.entityId, list);
      };

    result.errors.forEach(push('error'));
    result.warnings.forEach(push('warning'));
    return all;
  }

  /** Issues cached for one entity (empty when clean / never refreshed). */
  getIssues(entityId: string): ValidationIssue[] {
    return this.issues.get(entityId) ?? [];
  }

  /** Drop the cached validation (e.g. when the diagram is swapped). */
  clearValidation(): void {
    this.issues.clear();
  }

  /**
   * Every highlighter that applies right now, in paint order: validation first
   * (bottom), then selection, then hover, then connect targets (top).
   */
  compute(engine: DiagramEngine): Highlighter[] {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return [];

    const out: Highlighter[] = [];
    const connectionState = engine.getConnectionStateManager?.()?.getState?.();
    const validTargets: Set<string> = connectionState?.isConnecting
      ? connectionState.validTargetNodes ?? new Set<string>()
      : new Set<string>();

    for (const node of diagram.getNodes() as NodeModel[]) {
      if (node.state?.visible === false) continue;

      if (this.config.showValidation) {
        const worst = this.worstIssue(node.id);
        if (worst) {
          out.push({
            id: `validation-node-${node.id}`,
            kind: 'validation',
            entity: 'node',
            entityId: node.id,
            bounds: this.boxOf(node, this.config.validationPadding),
            rotation: node.rotation || 0,
            severity: worst.severity,
            message: worst.message,
            className: `grafloria-highlighter grafloria-highlighter-validation grafloria-highlighter-${worst.severity}`,
          });
        }
      }

      if (this.config.showSelection && node.isSelected()) {
        out.push({
          id: `selection-node-${node.id}`,
          kind: 'selection',
          entity: 'node',
          entityId: node.id,
          bounds: this.boxOf(node, this.config.selectionPadding),
          rotation: node.rotation || 0,
          className: 'grafloria-highlighter grafloria-highlighter-selection',
        });
      }

      if (this.config.showHover && node.state?.hovered && !node.isSelected()) {
        out.push({
          id: `hover-node-${node.id}`,
          kind: 'hover',
          entity: 'node',
          entityId: node.id,
          bounds: this.boxOf(node, this.config.hoverPadding),
          rotation: node.rotation || 0,
          className: 'grafloria-highlighter grafloria-highlighter-hover',
        });
      }

      if (this.config.showConnectTargets && validTargets.has(node.id)) {
        out.push({
          id: `connect-node-${node.id}`,
          kind: 'connect-target',
          entity: 'node',
          entityId: node.id,
          bounds: this.boxOf(node, this.config.selectionPadding),
          rotation: node.rotation || 0,
          className: 'grafloria-highlighter grafloria-highlighter-connect-target',
        });
      }
    }

    for (const link of diagram.getLinks() as LinkModel[]) {
      const points = link.points;
      if (!points || points.length < 2) continue;

      if (this.config.showValidation) {
        const worst = this.worstIssue(link.id);
        if (worst) {
          out.push({
            id: `validation-link-${link.id}`,
            kind: 'validation',
            entity: 'link',
            entityId: link.id,
            points: points.map((p: Point) => ({ ...p })),
            severity: worst.severity,
            message: worst.message,
            className: `grafloria-highlighter grafloria-highlighter-validation grafloria-highlighter-${worst.severity}`,
          });
        }
      }

      if (this.config.showSelection && link.state === 'selected') {
        out.push({
          id: `selection-link-${link.id}`,
          kind: 'selection',
          entity: 'link',
          entityId: link.id,
          points: points.map((p: Point) => ({ ...p })),
          className: 'grafloria-highlighter grafloria-highlighter-selection',
        });
      }

      if (this.config.showHover && link.state === 'hovered') {
        out.push({
          id: `hover-link-${link.id}`,
          kind: 'hover',
          entity: 'link',
          entityId: link.id,
          points: points.map((p: Point) => ({ ...p })),
          className: 'grafloria-highlighter grafloria-highlighter-hover',
        });
      }
    }

    return out;
  }

  /** Errors outrank warnings; the first of the worst severity wins. */
  protected worstIssue(entityId: string): ValidationIssue | null {
    const issues = this.issues.get(entityId);
    if (!issues || issues.length === 0) return null;
    return issues.find((i) => i.severity === 'error') ?? issues[0]!;
  }

  protected boxOf(node: NodeModel, padding: number): Rectangle {
    const box = node.getBoundingBox();
    return {
      x: box.left - padding,
      y: box.top - padding,
      width: box.right - box.left + padding * 2,
      height: box.bottom - box.top + padding * 2,
    };
  }
}
