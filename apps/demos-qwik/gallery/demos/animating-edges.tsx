import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const TYPES = ['marching-ants', 'flow', 'pulse', 'dash-flow'];

const nodes = TYPES.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: type },
  { id: 'b' + i, position: { x: 640, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: '' },
]);
const edges = TYPES.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { animation: { type, speed: 'normal' } },
}));

// --- the riders: a SHAPE travelling each wire (framework-free, as on the JS page) ---
//
// The engine's <svg> reconciler owns its subtree and wipes foreign children on
// every render, so the riders live in a SIBLING overlay <svg> that mirrors the
// engine's viewBox; a MutationObserver keeps it locked across pan / zoom / reroute.
const XLINK = 'http://www.w3.org/1999/xlink';
const svgEl = (tag: string) => document.createElementNS('http://www.w3.org/2000/svg', tag);

// Token factories — each centred on its own origin so <animateMotion> keeps it on the wire.
const circleToken = (color: string) => () => {
  const c = svgEl('circle');
  c.setAttribute('r', '6'); c.setAttribute('fill', color); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1.5');
  return c;
};
const diamondToken = (color: string) => () => {
  const p = svgEl('path');
  p.setAttribute('d', 'M0,-7 L7,0 L0,7 L-7,0 Z'); p.setAttribute('fill', color); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '1');
  return p;
};
const emojiToken = (char: string) => () => {
  const t = svgEl('text');
  t.textContent = char; t.setAttribute('font-size', '18'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
  return t;
};

// `begin` is negative (already under way) so each token starts at a spread-out phase.
const RIDERS: Record<string, { begin: string; make: () => SVGElement }[]> = {
  'marching-ants': [{ begin: '-0.6s', make: circleToken('#ec4899') }],
  'flow':          [{ begin: '-1.2s', make: emojiToken('📦') }],
  'pulse':         [{ begin: '-1.8s', make: diamondToken('#6366f1') }],
  'dash-flow':     [
    { begin: '-0.3s', make: circleToken('#0ea5e9') },
    { begin: '-1.1s', make: circleToken('#0ea5e9') },
    { begin: '-1.9s', make: circleToken('#0ea5e9') },
  ],
};
const RIDE_DUR = '2.4s';

/** Mount the rider overlay next to the engine's svg; returns its teardown. */
function mountRiders(host: HTMLElement, instance: DiagramInstance): () => void {
  const engSvg = host.querySelector('svg');
  if (!engSvg) return () => undefined;
  const overlay = svgEl('svg') as SVGSVGElement;
  overlay.id = 'flow-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  host.appendChild(overlay);

  TYPES.forEach((type, i) => {
    const wireId = `e${i}`;
    const guide = svgEl('path');
    guide.id = `flow-guide-${wireId}`;
    guide.setAttribute('fill', 'none');
    guide.setAttribute('stroke', 'none');
    overlay.appendChild(guide);
    RIDERS[type]!.forEach((r, j) => {
      const el = r.make();
      el.setAttribute('data-rider', `${wireId}-${j}`);
      const am = svgEl('animateMotion');
      am.setAttribute('dur', RIDE_DUR);
      am.setAttribute('repeatCount', 'indefinite');
      am.setAttribute('begin', r.begin);
      const mp = svgEl('mpath');
      mp.setAttribute('href', `#flow-guide-${wireId}`);
      mp.setAttributeNS(XLINK, 'xlink:href', `#flow-guide-${wireId}`);
      am.appendChild(mp);
      el.appendChild(am);
      overlay.appendChild(el);
    });
  });

  const sync = () => {
    const vb = engSvg.getAttribute('viewBox');
    if (vb) overlay.setAttribute('viewBox', vb);
    TYPES.forEach((_, i) => {
      const p = host.querySelector(`[data-link-id="e${i}"] path.diagram-link`);
      const g = overlay.querySelector(`#flow-guide-e${i}`);
      const d = p?.getAttribute('d');
      if (g && d) g.setAttribute('d', d);
    });
  };
  sync();
  // Watch the ENGINE svg, write only to the OVERLAY svg — no feedback loop.
  const obs = new MutationObserver(sync);
  obs.observe(engSvg, { attributes: true, attributeFilter: ['d', 'viewBox'], subtree: true });
  const offs: (() => void)[] = [];
  for (const ev of ['viewport:changed', 'viewport:change', 'viewport:zoomed']) {
    try { offs.push((instance.on as (e: string, fn: () => void) => () => void)(ev, sync)); } catch { /* not supported */ }
  }
  return () => {
    obs.disconnect();
    offs.forEach((off) => off?.());
    overlay.remove();
  };
}

/** Four CSS stroke animations from the spec — style.animation is a live
 *  keyframe on the painted path (marching-ants · flow · pulse · dash-flow) —
 *  AND a shape riding each wire (a dot, a 📦, a diamond, a train of dots) along
 *  the exact painted path via <animateMotion>, as on the JS gallery page. */
export default component$(() => {
  const root = useSignal<HTMLDivElement>();
  const teardown = useSignal<NoSerialize<() => void>>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => cleanup(() => teardown.value?.()));

  return (
    <div ref={root} style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges as never} onInit$={$((instance: DiagramInstance) => {
        // A demo of animations must not be silenced by the battery saver.
        instance.animations.updateConfig({ respectBatteryStatus: false, batterySavingMode: false } as never);
        instance.renderNow();
        const host = root.value?.querySelector('.grafloria-flow') as HTMLElement | null;
        if (host) teardown.value = noSerialize(mountRiders(host, instance));
        markReady();
      })} />
    </div>
  );
});
