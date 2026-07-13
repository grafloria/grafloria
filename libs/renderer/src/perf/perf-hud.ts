// Wave 8 (Performance & scale) — Card 7: the runtime perf HUD.
//
// The card asks for "a runtime perf HUD (FPS, dirty/culled/mounted-view counts)".
// The counts are the point, not the FPS. FPS tells you THAT the frame was slow; the
// counts tell you WHY — and in this engine the why has been the story every time:
//
//   • "culled 0 of 10,000" would have shown at a glance that viewport culling was
//     not culling.
//   • "routed 9,998 links" on a frame where nothing moved is the 5.5-second drag,
//     visible without a profiler.
//   • "governor: stepped-down (median 41ms)" is the difference between a governor
//     that is working and one that is silently doing nothing.
//
// So the HUD is a DATA structure first and a DOM overlay second. The data is what
// the benchmark harness and the tests consume; the overlay is a convenience for a
// human with a real diagram in front of them.

import type { GovernorState } from './quality-governor';

export interface PerfSnapshot {
  /** Rolling FPS. */
  fps: number;
  /** Last frame, ms. */
  frameMs: number;
  /** Entities in the model. */
  nodes: number;
  links: number;
  /** Entities that survived viewport culling — i.e. what we actually paid for. */
  visibleNodes: number;
  visibleLinks: number;
  /** Entities whose views exist in the DOM right now (lazy mounting, Card 3). */
  mountedViews: number;
  /** Entities re-rendered this frame (the dirty set, Card 0). */
  dirtyNodes: number;
  dirtyLinks: number;
  /** Links whose route was recomputed this frame (Card 6). Should be ~0 on an idle frame. */
  routedLinks: number;
  /** The LOD tier actually rendered, and the governor's reasoning. */
  tier: string;
  governor?: GovernorState;
}

export const EMPTY_SNAPSHOT: PerfSnapshot = {
  fps: 0,
  frameMs: 0,
  nodes: 0,
  links: 0,
  visibleNodes: 0,
  visibleLinks: 0,
  mountedViews: 0,
  dirtyNodes: 0,
  dirtyLinks: 0,
  routedLinks: 0,
  tier: 'high',
};

/**
 * Format a snapshot for a human.
 *
 * Deliberately calls out the ratios that reveal a bug rather than just printing
 * numbers: "culled 0/10000" reads as fine until you notice it means nothing was
 * culled. The HUD's job is to make that impossible to miss.
 */
export function formatSnapshot(s: PerfSnapshot): string[] {
  const culledNodes = s.nodes - s.visibleNodes;
  const culledLinks = s.links - s.visibleLinks;
  const lines = [
    `${s.fps.toFixed(0)} fps   ${s.frameMs.toFixed(1)} ms/frame`,
    `nodes  ${s.visibleNodes}/${s.nodes} visible   (culled ${culledNodes})`,
    `links  ${s.visibleLinks}/${s.links} visible   (culled ${culledLinks})`,
    `views  ${s.mountedViews} mounted`,
    `dirty  ${s.dirtyNodes} nodes, ${s.dirtyLinks} links`,
    `routed ${s.routedLinks} links this frame`,
    `tier   ${s.tier}`,
  ];
  if (s.governor) {
    const g = s.governor;
    lines.push(
      `gov    bias ${g.bias} · median ${g.medianMs.toFixed(1)}ms · ${g.lastDecision}`
    );
  }
  return lines;
}

/**
 * A DOM overlay, framework-free.
 *
 * Absolutely positioned, `pointer-events: none` — a debug HUD that eats clicks is a
 * bug generator of its own. It is opt-in and never mounted unless asked for.
 */
export class PerfHud {
  private el?: HTMLElement;

  constructor(private readonly host: HTMLElement) {}

  show(): void {
    if (this.el) return;
    const el = this.host.ownerDocument.createElement('div');
    el.setAttribute('data-grafloria-perf-hud', '');
    // A debug overlay must never intercept input, and must never be picked up by a
    // screen reader — it is developer instrumentation, not content.
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'z-index:2147483000',
      'pointer-events:none',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre',
      'padding:8px 10px',
      'border-radius:6px',
      'background:rgba(15,23,42,.82)',
      'color:#e2e8f0',
    ].join(';');
    this.host.appendChild(el);
    this.el = el;
  }

  update(snapshot: PerfSnapshot): void {
    if (!this.el) return;
    this.el.textContent = formatSnapshot(snapshot).join('\n');
  }

  hide(): void {
    this.el?.remove();
    this.el = undefined;
  }
}
