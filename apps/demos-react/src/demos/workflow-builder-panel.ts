// Workflow automation builder — the right-hand property panel, as data.
//
// Framework-free: what the panel shows for the current selection (a step's
// form, a Switch's outputs and rules, a line's two ends, a note's editor, the
// placeholder's trigger picks, the empty invitation). The JS page writes this
// as HTML strings into #panel; here it is one plain object every framework's
// template renders with the same classes and data-* names. The same file sits
// next to the workflow-builder demo in the React, Vue, Angular and Qwik apps.
import { ACTIONS, PLACEHOLDER, outputsOf, type Rule, type StepData } from './workflow-builder-catalog';
import { kindOf, portIdOf, appNameOf, summaryOf, tileOf, optionsOf } from './workflow-builder-steps';

export interface PanelTile { cls: string; icon: string | null }
export interface PanelField {
  key: string; label: string; type: string; required: boolean; placeholder: string;
  options: Array<{ value: string; label: string }>; value: string;
}
export interface PanelOut { i: number; label: string; rule: Rule | null; value: string }
export interface PanelEnd { tile: PanelTile; app: string; sub: string }
/** The panel: one shape for every mode (the fields a mode does not use stay empty). */
export interface PanelView {
  mode: 'placeholder' | 'step' | 'link' | 'note' | 'multi' | 'empty';
  tile: PanelTile | null;
  kind: string;                 // the small caps line over the title
  title: string;
  triggers: Array<{ key: string; label: string; app: string; icon: string }>;
  fields: PanelField[];
  isSwitch: boolean;
  outputs: PanelOut[];
  next: Array<{ port: string; label: string }>;
  from: PanelEnd | null;
  to: PanelEnd | null;
  noteTitle: string;
  noteText: string;
  count: number;                // multi: the steps selected
  steps: number;                // empty: the counts
  lines: number;
}
/** What is selected: a step, a line, a note, several steps, or nothing. */
export type Sel = { type: 'step' | 'link' | 'note'; id: string } | { type: 'multi'; ids: string[] } | null;

export const EMPTY_PANEL: PanelView = {
  mode: 'empty', tile: null, kind: '', title: '', triggers: [], fields: [], isSwitch: false, outputs: [], next: [],
  from: null, to: null, noteTitle: '', noteText: '', count: 0, steps: 0, lines: 0,
};

export function selectionExists(model: any, sel: NonNullable<Sel>): boolean {
  if (sel.type === 'step') return !!model?.getNode(sel.id);
  if (sel.type === 'link') return !!model?.getLink(sel.id);
  if (sel.type === 'note') return !!model?.getGroup(sel.id);
  return true;
}

/**
 * The panel for `sel` on `model`. `typed` holds what a number box shows while
 * it is typed in ('k:<field>' / 'o:<output>'): the step keeps the number, so an
 * emptied box would otherwise snap back to 0.
 */
export function panelView(model: any, sel: Sel, typed: Map<string, string>): PanelView {
  if (!model) return EMPTY_PANEL;
  if (sel?.type === 'step' && model.getNode(sel.id)) {
    const node = model.getNode(sel.id), data: StepData = node.data, a = ACTIONS[data.action], kind = kindOf(data);
    if (kind === 'placeholder') {
      return { ...EMPTY_PANEL, mode: 'placeholder', tile: tileOf(data), kind: 'Start here', title: 'Choose a trigger',
        triggers: Object.entries(ACTIONS).filter(([, x]) => x.kind === 'trigger').map(([k, x]) => ({ key: k, label: x.label, app: x.app, icon: x.icon })) };
    }
    const outs = outputsOf(data);
    return { ...EMPTY_PANEL, mode: 'step', tile: tileOf(data),
      kind: `${a.cat === 'Triggers' ? 'Trigger' : a.cat === 'Logic' ? 'Logic' : 'Action'} · ${a.app}`, title: a.label,
      fields: a.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, placeholder: f.placeholder ?? '',
        options: optionsOf(f), value: typed.get('k:' + f.key) ?? String(data.props[f.key] ?? '') })),
      isSwitch: kind === 'switch',
      outputs: kind === 'switch' ? (data.outputs ?? []).map((o, i) => ({ i, label: o.label, rule: o.rule ?? null,
        value: typed.get('o:' + i) ?? (o.rule ? String(o.rule.value) : '') })) : [],
      next: outs.map((o) => ({ port: portIdOf(node.id, data, o), label: `+ After ${o.label || a.app}` })) };
  }
  if (sel?.type === 'link' && model.getLink(sel.id)) {
    const l = model.getLink(sel.id), s = model.getNode(l.sourceNodeId), t = model.getNode(l.targetNodeId);
    const outLabel = s?.data ? outputsOf(s.data).find((o) => portIdOf(s.id, s.data, o) === l.sourcePortId)?.label : '';
    const end = (n: any, sub: string): PanelEnd | null => (n?.data ? { tile: tileOf(n.data), app: appNameOf(n.data), sub: `${summaryOf(n.data)}${sub ? ` · ${sub}` : ''}` } : null);
    const app = (n: any) => (n?.data ? appNameOf(n.data) : '');
    return { ...EMPTY_PANEL, mode: 'link', kind: 'Line', title: `${app(s)} → ${app(t)}`,
      from: end(s, outLabel ? `output “${outLabel}”` : 'output'), to: end(t, 'input') };
  }
  if (sel?.type === 'note' && model.getGroup(sel.id)) {
    const g = model.getGroup(sel.id), nt = g.getMetadata('note'), n = g.members.size;
    return { ...EMPTY_PANEL, mode: 'note', kind: 'Sticky note', title: `${n} step${n === 1 ? '' : 's'} inside`, noteTitle: nt.title, noteText: nt.text };
  }
  if (sel?.type === 'multi') return { ...EMPTY_PANEL, mode: 'multi', count: sel.ids.length };
  const steps = model.getNodes().filter((n: any) => n.data?.action && n.data.action !== PLACEHOLDER).length;
  return { ...EMPTY_PANEL, mode: 'empty', steps, lines: model.getLinks().length };
}
