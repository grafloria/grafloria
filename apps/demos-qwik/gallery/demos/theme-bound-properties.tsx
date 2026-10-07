import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME, type Theme } from '@grafloria/qwik';
import { themeRef, HIGH_CONTRAST_LIGHT_THEME } from '@grafloria/element';
import { markReady } from '../ready';

const SEVERITY: [string, string, number][] = [
  ['critical', 'Disk failure', 60],
  ['warning', 'Latency spike', 250],
  ['success', 'Backup complete', 440],
  ['info', 'Config reloaded', 630],
];

const nodes = [
  ...SEVERITY.map(([cat, label, x]) => ({
    id: cat, position: { x, y: 90 }, size: { width: 170, height: 76 }, data: { label },
    style: {
      fill: themeRef(`category.${cat}`),
      stroke: themeRef(`category.${cat}`),
      strokeWidth: themeRef('numbers.emphasis'),
    },
  })),
  { id: 'sink', position: { x: 340, y: 280 }, size: { width: 200, height: 76 }, data: { label: 'Incident queue' } },
];
const edges = SEVERITY.map(([cat]) => ({
  id: `e-${cat}`, source: cat, target: 'sink',
  style: { stroke: themeRef(`category.${cat}`), strokeWidth: themeRef('numbers.regular') },
}));

const THEMES = [
  { key: 'light', label: 'light', theme: LIGHT_THEME },
  { key: 'dark', label: 'dark', theme: DARK_THEME },
  { key: 'hc', label: 'high contrast', theme: HIGH_CONTRAST_LIGHT_THEME },
];

/** themeRef('category.critical') — a theme swap recolours the CALLER's own
 *  semantic colours, not just the chrome. The nodes never name a colour; they
 *  declare a MEANING and the theme decides what it looks like. */
export default component$(() => {
  const active = useSignal('light');
  const theme = (THEMES.find((t) => t.key === active.value)!.theme) as Theme;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <strong style={{ fontSize: '12px' }}>theme:</strong>
        {THEMES.map((t) => (
          <button key={t.key} onClick$={() => { active.value = t.key; }} aria-pressed={t.key === active.value}
            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} theme={theme} style={{ height: '100%' }}
          onInit$={$(() => markReady())} />
      </div>
    </div>
  );
});
