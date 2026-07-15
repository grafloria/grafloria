import type { DiagramEngine, Command, Point } from '@grafloria/engine';
import { SetNodeLabelCommand, SetLinkLabelCommand } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';

/**
 * InPlaceTextEditor — the model behind double-click-to-edit (Card 5,
 * wave4/interaction).
 *
 * A host cannot avoid owning the actual text widget (an `<input>`, a
 * `contenteditable`, a native text field), but everything AROUND it is
 * framework-agnostic and belongs here:
 *
 *  - WHAT is being edited (node label / link label) and its current text;
 *  - WHERE the editor goes, in world coordinates (the host maps to screen with
 *    its viewport, so the editor lands exactly over the text at any zoom);
 *  - the ONE undoable {@link Command} that commits the new value.
 *
 * The commit path is the point: before this, in-place edits wrote straight to the
 * model and could not be undone.
 */

export type TextEditTargetType = 'node' | 'link-label';

export interface TextEditTarget {
  type: TextEditTargetType;
  /** Node being edited (`type: 'node'`). */
  nodeId?: string;
  /** Link owning the label (`type: 'link-label'`). */
  linkId?: string;
  /** Which label on that link. */
  labelIndex?: number;
}

export interface TextEditSession {
  target: TextEditTarget;
  /** The text the editor opens with. */
  value: string;
  /** World rectangle the editor should cover. */
  bounds: Rectangle;
  /** World point the editor centres on (labels have no box of their own). */
  center: Point;
  /** Node labels wrap; link labels are single-line. */
  multiline: boolean;
}

export class InPlaceTextEditor {
  protected session: TextEditSession | null = null;

  getSession(): TextEditSession | null {
    return this.session ? { ...this.session } : null;
  }

  isEditing(): boolean {
    return this.session !== null;
  }

  /**
   * Open a session on a target. Returns null when the target does not exist or
   * is not editable (`behavior.editable === false`, or a locked node).
   */
  begin(engine: DiagramEngine, target: TextEditTarget): TextEditSession | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;

    if (target.type === 'node') {
      const node = target.nodeId ? diagram.getNode(target.nodeId) : undefined;
      if (!node) return null;
      if (node.behavior?.editable === false || node.state?.locked) return null;

      const box = node.getBoundingBox();
      const bounds: Rectangle = {
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      };
      this.session = {
        target: { ...target },
        value: String(node.getLabel() ?? ''),
        bounds,
        center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        multiline: true,
      };
      return this.getSession();
    }

    const link = target.linkId ? diagram.getLink(target.linkId) : undefined;
    const index = target.labelIndex ?? 0;
    const label = link?.labels?.[index];
    if (!link || !label) return null;

    // The label sits at `position` along the route, plus its own offset — the
    // exact anchor LabelRenderer draws it at, so the editor lands ON the text
    // instead of near it.
    const anchor = link.getPointAtPosition(label.position ?? 0.5);
    if (!anchor) return null;
    const center: Point = {
      x: anchor.x + (label.offset?.x ?? 0),
      y: anchor.y + (label.offset?.y ?? 0),
    };
    const width = Math.max(40, (label.text?.length ?? 0) * 8);
    const height = 20;

    this.session = {
      target: { ...target, labelIndex: index },
      value: label.text ?? '',
      bounds: { x: center.x - width / 2, y: center.y - height / 2, width, height },
      center,
      multiline: false,
    };
    return this.getSession();
  }

  /**
   * Commit the session's new value. Returns the undoable command (null for a
   * no-op edit, or when the session is gone). Always ends the session.
   */
  commit(engine: DiagramEngine, value: string): Command | null {
    const session = this.session;
    this.session = null;
    if (!session) return null;
    if (value === session.value) return null;

    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;

    if (session.target.type === 'node' && session.target.nodeId) {
      if (!diagram.getNode(session.target.nodeId)) return null;
      return new SetNodeLabelCommand(session.target.nodeId, value, session.value);
    }

    if (session.target.linkId !== undefined && session.target.labelIndex !== undefined) {
      if (!diagram.getLink(session.target.linkId)) return null;
      return new SetLinkLabelCommand(
        session.target.linkId,
        session.target.labelIndex,
        value,
        session.value
      );
    }

    return null;
  }

  /** Abandon the session without touching the model. */
  cancel(): void {
    this.session = null;
  }
}
