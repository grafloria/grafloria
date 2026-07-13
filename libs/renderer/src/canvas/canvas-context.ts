// canvas-context.ts — the 2D-context surface the painter is allowed to use,
// plus a RECORDING implementation of it.
//
// Two reasons the painter talks to an interface instead of
// `CanvasRenderingContext2D` directly:
//
//   1. TESTABILITY. `libs/renderer` is framework-agnostic and its tests run in
//      jsdom, which has no rasteriser. A recording context turns "what did the
//      canvas backend draw?" into an ordinary, assertable data structure — the
//      draw-call sequence — so canvas output can be diffed against the VNode
//      tree exactly, with no image snapshots and no `node-canvas` dependency.
//
//   2. A SMALL, HONEST SURFACE. The painter normalises every SVG primitive to
//      path commands (see path-geometry.ts), so it only ever needs move/line/
//      cubic/quad/close + fill/stroke/clip + text. That is the whole interface
//      below. A backend that can implement these can render a Grafloria diagram.

import type { Matrix, PathCmd } from './path-geometry';

/**
 * The subset of `CanvasRenderingContext2D` the painter uses. A real 2D context
 * satisfies this structurally — no adapter needed.
 */
export interface Canvas2DLike {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  filter?: string;

  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
  closePath(): void;

  fill(): void;
  stroke(): void;
  clip(): void;

  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;

  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };

  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): unknown;
  createRadialGradient?(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): unknown;
}

// ---------------------------------------------------------------------------
// Recording context
// ---------------------------------------------------------------------------

/** One recorded paint operation, with the state that produced it. */
export type DrawCall =
  | {
      op: 'fill';
      path: PathCmd[];
      fillStyle: unknown;
      globalAlpha: number;
      transform: Matrix;
      filter?: string;
    }
  | {
      op: 'stroke';
      path: PathCmd[];
      strokeStyle: unknown;
      lineWidth: number;
      lineDash: number[];
      globalAlpha: number;
      transform: Matrix;
      filter?: string;
    }
  | { op: 'clip'; path: PathCmd[]; transform: Matrix }
  | {
      op: 'fillText';
      text: string;
      x: number;
      y: number;
      font: string;
      fillStyle: unknown;
      textAlign: CanvasTextAlign;
      textBaseline: CanvasTextBaseline;
      globalAlpha: number;
      transform: Matrix;
    }
  | { op: 'clearRect'; x: number; y: number; w: number; h: number; transform: Matrix }
  | {
      op: 'fillRect';
      x: number;
      y: number;
      w: number;
      h: number;
      fillStyle: unknown;
      transform: Matrix;
    }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'setTransform'; transform: Matrix };

interface RecState {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  filter: string;
  lineDash: number[];
  transform: Matrix;
}

/**
 * A `Canvas2DLike` that records what was drawn instead of rasterising it.
 *
 * The recording is the assertion surface for the canvas backend's unit tests:
 * "the VNode tree said `<rect fill=#fff stroke=#333 stroke-width=2>` at
 * (100,100)" ⇒ "the context received a fill with fillStyle #fff and a stroke
 * with lineWidth 2 over exactly that path, under exactly that transform".
 *
 * It faithfully models the parts of the 2D state machine the painter depends on
 * — the save/restore stack, the current transform, the current path — so a bug
 * in the painter's state handling (a missing `restore`, a transform applied
 * twice) shows up in the recording rather than hiding behind a mock.
 */
export class RecordingContext2D implements Canvas2DLike {
  readonly calls: DrawCall[] = [];

  private stack: RecState[] = [];
  private state: RecState = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    filter: 'none',
    lineDash: [],
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  };

  private path: PathCmd[] = [];

  /** Width of one character, used by `measureText`. Matches the SVG-side estimate. */
  charWidthRatio = 0.6;

  get fillStyle(): unknown {
    return this.state.fillStyle;
  }
  set fillStyle(v: unknown) {
    this.state.fillStyle = v;
  }

  get strokeStyle(): unknown {
    return this.state.strokeStyle;
  }
  set strokeStyle(v: unknown) {
    this.state.strokeStyle = v;
  }

  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(v: number) {
    this.state.lineWidth = v;
  }

  get lineJoin(): CanvasLineJoin {
    return this.state.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.state.lineJoin = v;
  }

  get lineCap(): CanvasLineCap {
    return this.state.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.state.lineCap = v;
  }

  get globalAlpha(): number {
    return this.state.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.state.globalAlpha = v;
  }

  get font(): string {
    return this.state.font;
  }
  set font(v: string) {
    this.state.font = v;
  }

  get textAlign(): CanvasTextAlign {
    return this.state.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.state.textAlign = v;
  }

  get textBaseline(): CanvasTextBaseline {
    return this.state.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.state.textBaseline = v;
  }

  get filter(): string {
    return this.state.filter;
  }
  set filter(v: string) {
    this.state.filter = v;
  }

  save(): void {
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
    this.calls.push({ op: 'save' });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (prev) this.state = prev;
    this.calls.push({ op: 'restore' });
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.transform = { a, b, c, d, e, f };
    this.calls.push({ op: 'setTransform', transform: { a, b, c, d, e, f } });
  }

  beginPath(): void {
    this.path = [];
  }

  moveTo(x: number, y: number): void {
    this.path.push({ op: 'M', x, y });
  }

  lineTo(x: number, y: number): void {
    this.path.push({ op: 'L', x, y });
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.path.push({ op: 'C', x1, y1, x2, y2, x, y });
  }

  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
    this.path.push({ op: 'Q', x1, y1, x, y });
  }

  closePath(): void {
    this.path.push({ op: 'Z' });
  }

  fill(): void {
    this.calls.push({
      op: 'fill',
      path: [...this.path],
      fillStyle: this.state.fillStyle,
      globalAlpha: this.state.globalAlpha,
      transform: { ...this.state.transform },
      ...(this.state.filter && this.state.filter !== 'none' ? { filter: this.state.filter } : {}),
    });
  }

  stroke(): void {
    this.calls.push({
      op: 'stroke',
      path: [...this.path],
      strokeStyle: this.state.strokeStyle,
      lineWidth: this.state.lineWidth,
      lineDash: [...this.state.lineDash],
      globalAlpha: this.state.globalAlpha,
      transform: { ...this.state.transform },
      ...(this.state.filter && this.state.filter !== 'none' ? { filter: this.state.filter } : {}),
    });
  }

  clip(): void {
    this.calls.push({ op: 'clip', path: [...this.path], transform: { ...this.state.transform } });
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ op: 'clearRect', x, y, w, h, transform: { ...this.state.transform } });
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({
      op: 'fillRect',
      x,
      y,
      w,
      h,
      fillStyle: this.state.fillStyle,
      transform: { ...this.state.transform },
    });
  }

  setLineDash(segments: number[]): void {
    this.state.lineDash = [...segments];
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push({
      op: 'fillText',
      text,
      x,
      y,
      font: this.state.font,
      fillStyle: this.state.fillStyle,
      textAlign: this.state.textAlign,
      textBaseline: this.state.textBaseline,
      globalAlpha: this.state.globalAlpha,
      transform: { ...this.state.transform },
    });
  }

  /**
   * The same average-glyph estimate the SVG text-block engine uses
   * (`text.length * fontSize * 0.6`), so headless measurement agrees with the
   * line-breaking the VNode producer already did. A real 2D context measures
   * glyphs properly; this is only the headless stand-in.
   */
  measureText(text: string): { width: number } {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.state.font)?.[1] ?? '12');
    return { width: text.length * size * this.charWidthRatio };
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): unknown {
    const stops: Array<{ offset: number; color: string }> = [];
    return {
      __gradient: 'linear',
      x0,
      y0,
      x1,
      y1,
      stops,
      addColorStop(offset: number, color: string) {
        stops.push({ offset, color });
      },
    };
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): unknown {
    const stops: Array<{ offset: number; color: string }> = [];
    return {
      __gradient: 'radial',
      x0,
      y0,
      r0,
      x1,
      y1,
      r1,
      stops,
      addColorStop(offset: number, color: string) {
        stops.push({ offset, color });
      },
    };
  }

  /** Drop the recording (keeps the current state — mirrors a fresh frame). */
  reset(): void {
    this.calls.length = 0;
  }

  /** Every paint call (ignores bookkeeping ops) — the usual assertion target. */
  paintCalls(): DrawCall[] {
    return this.calls.filter(
      (c) => c.op === 'fill' || c.op === 'stroke' || c.op === 'fillText' || c.op === 'fillRect'
    );
  }
}

/** A `Canvas2DLike` that does nothing — the measure pass draws into it. */
export const NULL_CONTEXT: Canvas2DLike = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineJoin: 'miter',
  lineCap: 'butt',
  globalAlpha: 1,
  font: '',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  save: () => undefined,
  restore: () => undefined,
  setTransform: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  bezierCurveTo: () => undefined,
  quadraticCurveTo: () => undefined,
  closePath: () => undefined,
  fill: () => undefined,
  stroke: () => undefined,
  clip: () => undefined,
  clearRect: () => undefined,
  fillRect: () => undefined,
  setLineDash: () => undefined,
  fillText: () => undefined,
  measureText: (text: string) => ({ width: text.length * 6 }),
};
