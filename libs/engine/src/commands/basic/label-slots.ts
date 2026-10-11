/**
 * The two places an entity's label can live — canonical `metadata.label` and the
 * legacy `data.label` mirror (see DiagramEntity.getLabel/setLabel) — captured so
 * an undo can put BOTH back exactly as they were, absent included.
 *
 * Label commands used to remember one string, read from `metadata.label` only,
 * and restore it with setLabel(): a stencil-stamped node, labelled in
 * `data.label` alone, came back from undo with '' in both slots — blank
 * (S3, docs review v4).
 */
interface Labelled {
  getMetadata(key: string): unknown;
  setMetadata(key: string, value: unknown): void;
  deleteMetadata(key: string): void;
  getLabel(): string | undefined;
}

export interface LabelSlots {
  meta: { present: boolean; value: unknown };
  data: { present: boolean; value: unknown } | null;
}

function dataBag(entity: Labelled): Record<string, unknown> | undefined {
  return (entity as unknown as { data?: Record<string, unknown> }).data;
}

export function captureLabelSlots(entity: Labelled): LabelSlots {
  const meta = entity.getMetadata('label');
  const data = dataBag(entity);
  return {
    meta: { present: meta !== undefined, value: meta },
    data: data ? { present: 'label' in data, value: data['label'] } : null,
  };
}

export function restoreLabelSlots(entity: Labelled, slots: LabelSlots): void {
  if (slots.meta.present) entity.setMetadata('label', slots.meta.value);
  else if (entity.getMetadata('label') !== undefined) entity.deleteMetadata('label');
  const data = dataBag(entity);
  if (data && slots.data) {
    if (slots.data.present) data['label'] = slots.data.value;
    else delete data['label'];
  }
}
