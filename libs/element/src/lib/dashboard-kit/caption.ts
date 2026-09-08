/**
 * SECTION CAPTIONS — the header a section (container widget) may carry,
 * painted by the kit on the slab overlay it already owns.
 *
 * Three things only the kit can do for a section header, and this module is
 * where they are decided: RESERVE the pixels (`captionReserve` — the nested
 * board's frame starts below the band, so no child may take it), PAINT it
 * (`paintCaptionBand` — one DOM shape, one set of CSS variables, one theme),
 * and ROUTE its presses (`captionPassThrough` — a button or an input in the
 * band is content, everything else is the band, which selects the section).
 * Persistence is the container's business: the caption rides on the group's
 * `containerWidget` metadata beside `layout` and `sizing`, and `toJSON()`
 * writes it back.
 *
 * Plan and defaults: documentation/api-architecture/section-caption-plan.html.
 */

export interface SectionCaptionAction {
  id: string;
  /** Accessible name; painted as the glyph when there is no `icon`. */
  label: string;
  /** A glyph (emoji or short text). */
  icon?: string;
  /** Tooltip; default: the label. */
  title?: string;
  disabled?: boolean;
}

export interface SectionCaptionFont {
  size?: number;
  weight?: number | string;
  family?: string;
  color?: string;
  transform?: 'none' | 'uppercase';
}

export interface SectionCaptionOptions {
  /** Default: the container's `title`. */
  text?: string;
  /** A muted second line; the band grows to 44 px. */
  subtitle?: string;
  /** An ⓘ after the text: tooltip and the section's accessible description. */
  description?: string;
  /** A glyph before the text (emoji or short text). */
  icon?: string;
  /** 'inside' (default): a band inside the frame, reserved. 'tab': above the frame, nothing reserved. */
  position?: 'inside' | 'tab';
  /** Horizontal alignment (default 'start', mirrored on RTL). */
  align?: 'start' | 'center' | 'end';
  /** Vertical alignment within the band (default 'center'). */
  valign?: 'top' | 'center' | 'bottom';
  /** Band height, px (default 28; 44 with a subtitle). */
  height?: number;
  font?: SectionCaptionFont;
  /** Inside the band: px, or [vertical, horizontal] (default [0, 10]). */
  padding?: number | [number, number];
  /** Between the band and the frame: px, or [vertical, horizontal] (default 0). Adds to the reserve. */
  margin?: number | [number, number];
  /** Band fill (default: the theme's). */
  background?: string;
  /** The band's bottom rule, a CSS border value (default none). */
  border?: string;
  /** 'always' (default); 'design' is not painted (nor reserved) under static; 'hover' overlays the content, nothing reserved. */
  show?: 'always' | 'design' | 'hover';
  /** Buttons at the end of the band; a press fires `onCaptionAction` and never selects. */
  actions?: SectionCaptionAction[];
  /** Presses inside descendants matching this selector are content, never the band's. */
  passThrough?: string;
  /** Your class on the band. */
  className?: string;
}

/** `false`/absent: no band. `true`: the title. A string: that text. */
export type SectionCaption = false | true | string | SectionCaptionOptions;

export const CAPTION_HEIGHT = 28;
export const CAPTION_HEIGHT_SUBTITLE = 44;
export const CAPTION_HEIGHT_TIGHT = 22;
/** A section shorter than this steps its band down to the tight tier. */
export const CAPTION_TIGHT_BELOW = 90;
export const CAPTION_PASS_THROUGH = 'button, a, input, select, textarea, [data-axdb-pass]';

/** The caption as options, or null when there is none. `title` fills the text. */
export function normalizeCaption(c: SectionCaption | undefined, title?: string): SectionCaptionOptions | null {
  if (c === undefined || c === false) return null;
  const o: SectionCaptionOptions = c === true ? {} : typeof c === 'string' ? { text: c } : { ...c };
  if (o.text === undefined && title !== undefined) o.text = title;
  return o;
}

/** The caption a section GROUP carries, from its persisted `containerWidget` metadata. */
export function captionOfGroup(grp: { getMetadata(key: string): unknown; name?: string } | undefined): SectionCaptionOptions | null {
  if (!grp) return null;
  const meta = grp.getMetadata('containerWidget') as { caption?: SectionCaption; title?: string } | undefined;
  if (!meta || meta.caption === undefined) return null;
  return normalizeCaption(meta.caption, meta.title ?? grp.name);
}

export function pairOf(v: number | [number, number] | undefined, dflt: [number, number]): [number, number] {
  if (v === undefined) return dflt;
  return typeof v === 'number' ? [v, v] : [v[0], v[1]];
}

/** Painted at all? `show: 'design'` disappears under static. */
export function captionPainted(c: SectionCaptionOptions | null, isStatic: boolean): boolean {
  if (!c) return false;
  return !(c.show === 'design' && isStatic);
}

/** The band's height for a section of `sectionH` px. */
export function captionBandHeight(c: SectionCaptionOptions, sectionH: number): number {
  if (sectionH > 0 && sectionH < CAPTION_TIGHT_BELOW) return CAPTION_HEIGHT_TIGHT;
  return c.height ?? (c.subtitle ? CAPTION_HEIGHT_SUBTITLE : CAPTION_HEIGHT);
}

/** Pixels the nested board's frame gives up at the top: the band plus its vertical margins. */
export function captionReserve(c: SectionCaptionOptions | null, ctx: { static: boolean; sectionH: number }): number {
  if (!c || !captionPainted(c, ctx.static)) return 0;
  if (c.position === 'tab' || c.show === 'hover') return 0;
  const [mv] = pairOf(c.margin, [0, 0]);
  return captionBandHeight(c, ctx.sectionH) + 2 * mv;
}

/** Identity of a painted band: repaint only when this changes (the tier is a class toggle, not a repaint). */
export function captionKey(c: SectionCaptionOptions, ctx: { rtl: boolean; static: boolean }): string {
  return JSON.stringify([c, ctx.rtl, ctx.static]);
}

/** Is a section of `sectionH` px in the tight tier? */
export const captionTight = (sectionH: number): boolean => sectionH > 0 && sectionH < CAPTION_TIGHT_BELOW;

/** The per-sync geometry of a painted band: height and tier follow the section's live size. */
export function sizeCaptionBand(band: HTMLElement, c: SectionCaptionOptions, sectionH: number): void {
  const h = captionBandHeight(c, sectionH);
  band.classList.toggle('axdb-slab-h--tight', captionTight(sectionH));
  band.style.height = `${h}px`;
  if (c.position === 'tab') band.style.top = `${-h}px`;
}

/** Is a press on `target`, inside `band`, content rather than the band? Actions are never pass-through. */
export function captionPassThrough(target: Element | null, band: Element, c: SectionCaptionOptions | null): boolean {
  if (!target || !band.contains(target)) return false;
  if (target.closest('.axdb-slab-h-action')) return false;
  const sel = c?.passThrough ?? CAPTION_PASS_THROUGH;
  const hit = target.closest(sel);
  return !!hit && band.contains(hit) && hit !== band;
}

const el = (doc: Document, cls: string, text?: string): HTMLElement => {
  const e = doc.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * Paint the band: geometry (inline, so the reserve and the pixels agree),
 * classes for alignment and mode, CSS variables for typography and box, and
 * the default content — icon, text, subtitle, ⓘ, actions. With `render` the
 * content is yours: the band is handed over empty and keeps its press rules.
 */
export function paintCaptionBand(
  band: HTMLElement,
  c: SectionCaptionOptions,
  ctx: { rtl: boolean; static: boolean; sectionH: number; render?: (host: HTMLElement) => void }
): void {
  const doc = band.ownerDocument;
  const h = captionBandHeight(c, ctx.sectionH);
  const [mv, mh] = pairOf(c.margin, [0, 0]);
  const [pv, ph] = pairOf(c.padding, [0, 10]);
  band.className = 'axdb-slab-h';
  band.textContent = '';
  const cls = (name: string, on: boolean) => band.classList.toggle(name, on);
  cls('axdb-slab-h--tab', c.position === 'tab');
  cls('axdb-slab-h--hover', c.show === 'hover');
  cls('axdb-slab-h--tight', captionTight(ctx.sectionH));
  cls('axdb-slab-h--center', c.align === 'center');
  cls('axdb-slab-h--end', c.align === 'end');
  cls('axdb-slab-h--vtop', c.valign === 'top');
  cls('axdb-slab-h--vbottom', c.valign === 'bottom');
  if (c.className) for (const k of c.className.split(/\s+/).filter(Boolean)) band.classList.add(k);
  band.setAttribute('dir', ctx.rtl ? 'rtl' : 'ltr');
  band.style.height = `${h}px`;
  band.style.top = c.position === 'tab' ? `${-h}px` : `${mv}px`;
  band.style.left = `${mh}px`;
  band.style.right = c.position === 'tab' ? 'auto' : `${mh}px`; // a tab is sized to its text
  const v = (name: string, value: string | undefined) => {
    if (value === undefined) band.style.removeProperty(name);
    else band.style.setProperty(name, value);
  };
  v('--axdb-caption-pad', `${pv}px ${ph}px`);
  // Clamped to the CONFIGURED band (the tight tier caps it again in CSS), so
  // the text never exceeds the band whatever size the section is painted at.
  const bandH = c.height ?? (c.subtitle ? CAPTION_HEIGHT_SUBTITLE : CAPTION_HEIGHT);
  v('--axdb-caption-font-size', c.font?.size !== undefined ? `${Math.min(c.font.size, Math.max(8, bandH - 2 * pv - 4))}px` : undefined);
  v('--axdb-caption-font-weight', c.font?.weight !== undefined ? String(c.font.weight) : undefined);
  v('--axdb-caption-font-family', c.font?.family);
  v('--axdb-caption-fg', c.font?.color);
  v('--axdb-caption-transform', c.font?.transform);
  v('--axdb-caption-bg', c.background);
  v('--axdb-caption-border', c.border);
  if (ctx.render) {
    ctx.render(band);
    return;
  }
  if (c.icon) band.appendChild(el(doc, 'axdb-slab-h-icon', c.icon));
  const body = el(doc, 'axdb-slab-h-body');
  const text = el(doc, 'axdb-slab-h-text', c.text ?? '');
  text.setAttribute('title', c.text ?? '');
  body.appendChild(text);
  if (c.subtitle) body.appendChild(el(doc, 'axdb-slab-h-sub', c.subtitle));
  band.appendChild(body);
  if (c.description) {
    const info = el(doc, 'axdb-slab-h-info', 'ⓘ');
    info.setAttribute('title', c.description);
    info.setAttribute('aria-label', c.description);
    band.appendChild(info);
  }
  if (c.actions?.length) {
    const row = el(doc, 'axdb-slab-h-actions');
    for (const a of c.actions) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'axdb-slab-h-action';
      b.setAttribute('data-action', a.id);
      b.setAttribute('aria-label', a.label);
      b.setAttribute('title', a.title ?? a.label);
      b.textContent = a.icon ?? a.label;
      if (a.disabled) b.disabled = true;
      if (ctx.static) b.tabIndex = -1;
      row.appendChild(b);
    }
    band.appendChild(row);
  }
}
