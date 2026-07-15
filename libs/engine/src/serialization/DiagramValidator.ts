// Load-time structural integrity validation for serialized diagrams.
//
// The validator inspects the SERIALIZED shape (before entities are
// constructed) and reports structured findings instead of throwing, so
// callers choose their policy: ignore, warn, or fail hard. It catches the
// corruption classes that otherwise surface as silent misbehavior long after
// load — dangling link endpoints, duplicate ids, orphaned group references.

import type { SerializedDiagram } from '../models/DiagramModel';

export interface DiagramValidationFinding {
  severity: 'error' | 'warning';
  /** Stable machine-readable code (e.g. 'duplicate-id', 'dangling-link-endpoint'). */
  code: string;
  message: string;
  /** Id of the entity the finding is about, when applicable. */
  entityId?: string;
}

export interface DiagramValidationReport {
  ok: boolean;
  errors: DiagramValidationFinding[];
  warnings: DiagramValidationFinding[];
}

/** Thrown by strict-mode loads when the document has integrity errors. */
export class DiagramValidationError extends Error {
  constructor(public readonly report: DiagramValidationReport) {
    super(
      `Diagram document failed integrity validation with ${report.errors.length} error(s): ` +
        report.errors.map((e) => `[${e.code}] ${e.message}`).join('; ')
    );
    this.name = 'DiagramValidationError';
  }
}

export function validateSerializedDiagram(data: SerializedDiagram): DiagramValidationReport {
  const errors: DiagramValidationFinding[] = [];
  const warnings: DiagramValidationFinding[] = [];
  const error = (code: string, message: string, entityId?: string) =>
    errors.push({ severity: 'error', code, message, entityId });
  const warning = (code: string, message: string, entityId?: string) =>
    warnings.push({ severity: 'warning', code, message, entityId });

  const nodes = data.nodes ?? [];
  const links = data.links ?? [];
  const groups = data.groups ?? [];
  const strokes = data.strokes ?? []; // wave10/whiteboard

  // --- duplicate ids (within and across collections) -----------------------
  const seen = new Map<string, string>(); // id -> collection
  const checkId = (id: string | undefined, kind: string) => {
    if (!id) {
      error('missing-id', `A serialized ${kind} has no id`);
      return;
    }
    const prior = seen.get(id);
    if (prior) {
      error('duplicate-id', `Id '${id}' is used by both a ${prior} and a ${kind}`, id);
    } else {
      seen.set(id, kind);
    }
  };
  nodes.forEach((n) => checkId(n?.id, 'node'));
  links.forEach((l) => checkId(l?.id, 'link'));
  groups.forEach((g) => checkId(g?.id, 'group'));
  // wave10/whiteboard. Ink joins the CROSS-COLLECTION id check, which is the point: a
  // stroke sharing an id with a node is exactly the corruption `applyOp` cannot survive
  // (the op targets are per-kind, but undo's register key is `target id path`, and two
  // kinds under one id make two different entities share one register).
  strokes.forEach((s) => checkId(s?.id, 'stroke'));

  // A stroke with no points draws nothing and hit-tests as nothing — it is invisible
  // débris that can only be removed by an eraser that cannot find it. Not an error (the
  // document is structurally sound), but the user should know it is there.
  for (const s of strokes) {
    if (!s) continue;
    if (!Array.isArray(s.points) || s.points.length === 0) {
      warning('empty-stroke', `Stroke '${s.id}' has no points and can never be seen`, s.id);
    } else if (s.points.some((p) => !p || !isFinite(p.x) || !isFinite(p.y))) {
      error(
        'invalid-stroke-point',
        `Stroke '${s.id}' has a non-finite point, which poisons its bounds to NaN and ` +
          `culls it from every viewport query`,
        s.id
      );
    }
  }

  // --- port ownership map ---------------------------------------------------
  const portOwner = new Map<string, string>(); // portId -> nodeId
  for (const n of nodes) {
    for (const p of n?.ports ?? []) {
      if (!p?.id) continue;
      const prior = portOwner.get(p.id);
      if (prior && prior !== n.id) {
        error(
          'duplicate-port-id',
          `Port id '${p.id}' appears on both node '${prior}' and node '${n.id}'`,
          p.id
        );
      }
      portOwner.set(p.id, n.id);
    }
  }

  // --- link endpoints resolve to real ports ---------------------------------
  for (const l of links) {
    if (!l) continue;
    for (const [end, portId] of [
      ['source', l.sourcePortId],
      ['target', l.targetPortId],
    ] as const) {
      if (!portId || !portOwner.has(portId)) {
        error(
          'dangling-link-endpoint',
          `Link '${l.id}' ${end} port '${portId ?? '(none)'}' does not exist on any serialized node`,
          l.id
        );
      }
    }
  }

  // --- node parent references ------------------------------------------------
  const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean) as string[]);
  for (const n of nodes) {
    if (n?.parentId && !nodeIds.has(n.parentId)) {
      warning(
        'missing-parent',
        `Node '${n.id}' references missing parent '${n.parentId}'`,
        n.id
      );
    }
  }

  // --- group membership + containment tree -----------------------------------
  const groupIds = new Set(groups.map((g) => g?.id).filter(Boolean) as string[]);
  for (const g of groups) {
    if (!g) continue;
    for (const member of g.members ?? []) {
      if (!nodeIds.has(member) && !groupIds.has(member)) {
        warning(
          'missing-group-member',
          `Group '${g.id}' references missing member '${member}'`,
          g.id
        );
      }
    }
    if (g.parentGroupId !== undefined) {
      if (!groupIds.has(g.parentGroupId)) {
        error(
          'missing-parent-group',
          `Group '${g.id}' references missing parent group '${g.parentGroupId}'`,
          g.id
        );
      }
    }
  }

  // containment cycles (follow parentGroupId pointers)
  const parentOf = new Map<string, string | undefined>(
    groups.filter(Boolean).map((g) => [g.id, g.parentGroupId])
  );
  for (const g of groups) {
    if (!g) continue;
    const trail = new Set<string>([g.id]);
    let cur = parentOf.get(g.id);
    while (cur !== undefined) {
      if (trail.has(cur)) {
        error('group-cycle', `Group containment cycle involving '${g.id}'`, g.id);
        break;
      }
      trail.add(cur);
      cur = parentOf.get(cur);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
