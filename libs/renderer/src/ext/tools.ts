/**
 * ============================================================================
 * Card 5 — overridable interaction tools + connection validation
 * ============================================================================
 *
 * SCOPE, STATED PLAINLY. Wave 2 shipped a `ToolManager` that already arbitrates
 * gestures (one active tool per gesture, movement threshold, DELIBERATE gating)
 * — but it lives in `libs/renderer-angular`, and the framework-free
 * `DomEventBinder` in `libs/renderer` REIMPLEMENTS the same two rules rather
 * than sharing it. The brief said "make those pluggable, don't rewrite them",
 * and rewriting either one is out of scope for this wave.
 *
 * So this ships the REGISTRY and the VALIDATION hook — the two things that were
 * genuinely absent — and the binder consults them:
 *
 *   1. A TOOL REGISTRY. The five gesture tools stop being privileged code paths
 *      and become named registrations that a host can REPLACE. A registered tool
 *      gets first refusal on a gesture (`hitTest` → `onPointerDown`); if no tool
 *      claims it, the built-in ladder runs exactly as before. This is additive:
 *      with no tools registered, behaviour is byte-identical.
 *
 *   2. `isValidConnection`. The engine could only veto a connection through
 *      hardcoded rules (port type + `maxConnections` on `PortModel.canConnectTo`);
 *      a HOST had no way to inject "an Order may not connect to an Invoice".
 *      Validators registered here are consulted wherever the renderer offers a
 *      connection — and ALL must pass.
 *
 * NOTE ON OWNERSHIP: `wave6/ports` owns port internals and the engine's
 * connection-validation internals. This registry therefore lives in the
 * RENDERER's extension layer and is consumed at the renderer's own seams; it
 * does NOT reach into `PortModel.canConnectTo` or `ConnectionStateManager`.
 * If that sibling promotes a validation hook in the engine, this becomes a thin
 * forwarder to it.
 */

import type { LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import type { Disposer } from './disposable';
import { snapshotRestore } from './disposable';

// ===========================================================================
// Connection validation
// ===========================================================================

/** Everything a validator needs to judge a proposed connection. */
export interface ConnectionCandidate {
  sourceNode: NodeModel;
  sourcePort: PortModel | null;
  targetNode: NodeModel;
  targetPort: PortModel | null;
  /** Present when RECONNECTING an existing link rather than drawing a new one. */
  link?: LinkModel;
}

/** Return false (or a reason string) to veto. */
export type ConnectionValidator = (candidate: ConnectionCandidate) => boolean | string;

const validators = new Map<string, ConnectionValidator>();
let validatorSeq = 0;

/**
 * Register a connection validator. ALL registered validators must pass for a
 * connection to be offered — veto power, not voting power, because a rule that
 * can be outvoted is not a rule.
 */
export function registerConnectionValidator(validator: ConnectionValidator): Disposer {
  const key = `validator-${++validatorSeq}`;
  validators.set(key, validator);
  return () => {
    validators.delete(key);
  };
}

export interface ConnectionValidity {
  valid: boolean;
  /** The first veto's reason, when it gave one. */
  reason?: string;
}

/**
 * Evaluate every registered validator. This is the public `isValidConnection`
 * hook. With no validators registered it is `{ valid: true }` — i.e. free.
 */
export function isValidConnection(candidate: ConnectionCandidate): ConnectionValidity {
  for (const validator of validators.values()) {
    let verdict: boolean | string;
    try {
      verdict = validator(candidate);
    } catch {
      // A throwing validator must not let an invalid link through, nor take the
      // interaction down. Treat it as a veto.
      return { valid: false, reason: 'validator threw' };
    }
    if (verdict === false) return { valid: false };
    if (typeof verdict === 'string') return { valid: false, reason: verdict };
  }
  return { valid: true };
}

/** How many validators are live (tests assert this returns to 0 after dispose). */
export function connectionValidatorCount(): number {
  return validators.size;
}

export function clearConnectionValidators(): void {
  validators.clear();
}

// ===========================================================================
// Tool registry
// ===========================================================================

/** The built-in gesture tools, by name. A registration may REPLACE any of them. */
export type BuiltinToolId = 'select' | 'node-drag' | 'link-draw' | 'marquee' | 'pan';
export type ToolId = BuiltinToolId | (string & {});

export interface ToolModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

/** A pointer gesture event, in both coordinate spaces. */
export interface ToolPointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  /** World-space (camera applied). */
  world: { x: number; y: number };
  /** Element-local CSS px — the drag threshold is measured here. */
  screen: { x: number; y: number };
  modifiers: ToolModifiers;
  /** The original DOM event, when there was one. */
  source?: PointerEvent | MouseEvent;
}

/** What the gesture landed on, resolved once on pointerdown. */
export interface ToolHitContext {
  node?: NodeModel;
  link?: LinkModel;
  port?: PortModel;
  /** True when the pointer went down on empty canvas. */
  empty: boolean;
  /** Was the hit node already selected BEFORE this gesture? (DELIBERATE mode). */
  nodeWasSelected?: boolean;
}

/**
 * A canvas tool. `hitTest` is the claim: return true on pointerdown and this
 * tool OWNS the whole gesture (move/up/cancel) — no other tool, and none of the
 * built-in ladder, will see it.
 */
export interface CanvasTool {
  readonly id: ToolId;
  /**
   * Higher wins when several tools claim the same gesture. Built-in-replacing
   * tools should use a priority > 0; the built-in ladder is effectively 0.
   */
  readonly priority?: number;
  /** Claim this gesture? */
  hitTest(event: ToolPointerEvent, hit: ToolHitContext): boolean;
  onPointerDown?(event: ToolPointerEvent, hit: ToolHitContext): void;
  onPointerMove?(event: ToolPointerEvent, hit: ToolHitContext): void;
  onPointerUp?(event: ToolPointerEvent, hit: ToolHitContext): void;
  onCancel?(): void;
  /** Called when the tool is unregistered while active. */
  dispose?(): void;
}

const tools = new Map<string, CanvasTool>();

/**
 * Register (or replace) a canvas tool. Returns a disposer that RESTORES the
 * previous tool of the same id — so overriding `'node-drag'` and then unloading
 * the extension gives the original back rather than leaving a hole.
 */
export function registerTool(tool: CanvasTool): Disposer {
  const previous = tools.get(tool.id);
  tools.set(tool.id, tool);
  return snapshotRestore(
    previous,
    (value) => tools.set(tool.id, value),
    () => {
      tools.get(tool.id)?.dispose?.();
      tools.delete(tool.id);
    }
  );
}

export function getTool(id: string): CanvasTool | undefined {
  return tools.get(id);
}

export function hasTool(id: string): boolean {
  return tools.has(id);
}

export function listTools(): string[] {
  return [...tools.keys()];
}

export function clearTools(): void {
  for (const tool of tools.values()) tool.dispose?.();
  tools.clear();
}

/**
 * The tool (if any) that claims this gesture, highest priority first.
 *
 * The DomEventBinder calls this FIRST on pointerdown. `undefined` means "no
 * registered tool wants it" — and then the built-in ladder runs untouched, which
 * is why adding this seam changed no existing behaviour.
 */
export function resolveTool(
  event: ToolPointerEvent,
  hit: ToolHitContext
): CanvasTool | undefined {
  let best: CanvasTool | undefined;
  let bestPriority = -Infinity;

  for (const tool of tools.values()) {
    let claims = false;
    try {
      claims = tool.hitTest(event, hit);
    } catch {
      // A throwing tool declines rather than killing the gesture.
      claims = false;
    }
    if (!claims) continue;
    const priority = tool.priority ?? 1;
    if (priority > bestPriority) {
      best = tool;
      bestPriority = priority;
    }
  }
  return best;
}
