/**
 * TDD — [plugins] on the Angular canvas, written BEFORE the implementation.
 *
 * The canvas keeps a PERSISTENT ViewportController two-way-synced with its
 * [(zoom)]/[(viewport)] signals and hands attachCanvasPlugins a structural
 * CanvasPluginHost. That makes minimap + controls + background — the same
 * plugins React and Vue mount — first-class Angular:
 *
 *   - `[plugins]="true"` mounts the minimap into the canvas DOM
 *   - the controls' zoom button drives `[(zoom)]` — plugin → canvas
 *   - a `[zoom]` binding change reaches the plugins' camera — canvas → plugin
 *   - destroying the canvas disposes the plugin DOM
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import type { NodeSpec } from '@grafloria/renderer';

@Component({
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas
      style="display:block;width:800px;height:600px"
      [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
      [(zoom)]="zoom"
      [plugins]="plugins()"
      [(nodes)]="nodes">
    </grafloria-diagram-canvas>
  `,
})
class PluginsHost {
  zoom = 1;
  plugins = signal<boolean | object | undefined>(true);
  nodes = signal<NodeSpec[]>([
    { id: 'a', position: { x: 40, y: 40 }, size: { width: 100, height: 50 }, label: 'A' },
    { id: 'b', position: { x: 300, y: 200 }, size: { width: 100, height: 50 }, label: 'B' },
  ]);
}

describe('[plugins] — minimap/controls/background on the Angular canvas', () => {
  let fixture: ComponentFixture<PluginsHost>;
  let host: PluginsHost;
  let el: HTMLElement;
  let canvas: DiagramCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PluginsHost] }).compileComponents();
    fixture = TestBed.createComponent(PluginsHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  /** The plugin chain loads lazily — wait for the minimap to arrive. */
  async function pluginsMounted(): Promise<void> {
    for (let i = 0; i < 100 && !el.querySelector('.grafloria-minimap'); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it('mounts the minimap and controls (lazily)', async () => {
    await pluginsMounted();
    expect(el.querySelector('.grafloria-minimap')).toBeTruthy();
    expect(el.querySelector('[title="Zoom in"], [aria-label="Zoom in"]')).toBeTruthy();
  });

  it('plugin → canvas: the zoom-in control drives [(zoom)]', async () => {
    await pluginsMounted();
    const before = host.zoom;
    const btn = el.querySelector('[title="Zoom in"], [aria-label="Zoom in"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();
    expect(host.zoom).toBeGreaterThan(before);
  });

  it('canvas → plugin: a zoom signal change reaches the plugins camera', () => {
    const cam = (canvas as any).pluginsCamera;
    expect(cam).toBeTruthy();
    host.zoom = 2;
    fixture.detectChanges();
    expect(cam.getZoom()).toBeCloseTo(2, 5);
  });

  it('[plugins] set to undefined disposes the plugin DOM', async () => {
    await pluginsMounted();
    host.plugins.set(undefined);
    fixture.detectChanges();
    expect(el.querySelector('.grafloria-minimap')).toBeNull();
  });

  it('destroying the canvas removes the plugin DOM', async () => {
    await pluginsMounted();
    fixture.destroy();
    expect(document.querySelector('.grafloria-minimap')).toBeNull();
  });
});
