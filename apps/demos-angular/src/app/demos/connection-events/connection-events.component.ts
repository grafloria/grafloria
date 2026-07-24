import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A live log of the connection lifecycle the engine fires as you drag a wire —
 *  start, per-move update, port enter/leave, then complete or cancel. The stream
 *  splits the "end" into complete (valid) vs cancel (abandoned/refused). Wired by
 *  subscribing to the engine's eventBus, exactly the events a real drag fires. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="padding:8px 24px 10px;border-bottom:1px solid rgba(127,127,127,.25);font:12px/1.4 ui-monospace,monospace">
      <div #flags style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="flag" data-ev="connection:start" style="padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;opacity:.32">start</span>
        <span class="flag" data-ev="connection:update" style="padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;opacity:.32">update</span>
        <span class="flag" data-ev="connection:port-enter" style="padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;opacity:.32">port-enter</span>
        <span class="flag" data-ev="connection:complete" style="padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;opacity:.32">complete</span>
        <span class="flag" data-ev="connection:cancel" style="padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;opacity:.32">cancel</span>
        <button #clear style="font:inherit;padding:2px 9px;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit;cursor:pointer">clear</button>
      </div>
      <div #log style="margin-top:8px;height:88px;overflow-y:auto;white-space:pre;opacity:.9"><span style="opacity:.5">drag from the source's right port to see the connection lifecycle fire…</span></div>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block;height:calc(100vh - 150px);min-height:300px" />
  `,
})
export class ConnectionEventsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  flags = viewChild.required<ElementRef<HTMLElement>>('flags');
  log = viewChild.required<ElementRef<HTMLElement>>('log');
  clear = viewChild.required<ElementRef<HTMLButtonElement>>('clear');
  nodes: any[] = [
    { id: 'src', position: { x: 80, y: 70 }, size: { width: 150, height: 60 }, label: 'source',
      ports: [{ id: 'src.out', side: 'right', type: 'output' }] },
    { id: 'dst', position: { x: 430, y: 70 }, size: { width: 150, height: 60 }, label: 'target',
      ports: [{ id: 'dst.in', side: 'left', type: 'input' }] },
  ];
  edges: any[] = [];

  private readonly summary: Record<string, (p: any) => string> = {
    'connection:start': (p) => p?.sourcePort?.id ?? '?',
    'connection:update': (p) => `${p?.targetPort?.id ?? '(none)'} ${p?.isValid ? 'ok' : 'no'}`,
    'connection:port-enter': (p) => `${p?.port?.id ?? '?'} ${p?.isValid ? 'ok' : '✗ ' + (p?.rejectionReason ?? '')}`,
    'connection:port-leave': (p) => p?.port?.id ?? '?',
    'connection:complete': (p) => `${p?.sourcePortId ?? '?'} → ${p?.targetPortId ?? '?'}`,
    'connection:cancel': (p) => `${p?.sourcePort?.id ?? '?'} (abandoned / refused)`,
  };

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine() as any;
    const logEl = this.log().nativeElement;
    const flagEls = new Map<string, HTMLElement>(
      Array.from(this.flags().nativeElement.querySelectorAll<HTMLElement>('.flag')).map((el) => [el.dataset['ev']!, el]));

    const light = (name: string) => {
      const el = flagEls.get(name); if (!el) return;
      el.style.opacity = '1'; el.style.fontWeight = '600';
      clearTimeout((el as any)._t);
      (el as any)._t = setTimeout(() => { el.style.opacity = '.32'; el.style.fontWeight = ''; }, 1100);
    };
    const logRow = (name: string, payload: any) => {
      const first = logEl.firstElementChild as HTMLElement | null;
      if (first && first.tagName === 'SPAN') first.remove();
      const row = document.createElement('div');
      row.className = 'row';
      const summary = (this.summary[name] ?? (() => ''))(payload);
      row.innerHTML = `<span style="display:inline-block;min-width:168px;font-weight:600"></span><span></span>`;
      (row.children[0] as HTMLElement).textContent = name;
      (row.children[1] as HTMLElement).textContent = summary;
      logEl.prepend(row);
      while (logEl.querySelectorAll('.row').length > 12) logEl.querySelector('.row:last-child')!.remove();
    };

    if (engine?.eventBus) {
      for (const name of Object.keys(this.summary)) {
        engine.eventBus.on(name, (payload: any) => { light(name); logRow(name, payload); });
      }
    }
    this.clear().nativeElement.addEventListener('click', () => {
      logEl.innerHTML = '<span style="opacity:.5">— log cleared —</span>';
    });
    markReady();
  }
}
