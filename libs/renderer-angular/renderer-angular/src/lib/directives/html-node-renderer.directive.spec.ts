import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HtmlNodeRendererDirective } from './html-node-renderer.directive';
import { ComponentRendererService } from '../services/component-renderer.service';

/**
 * Host component that exercises the [htmlNodeRenderer] directive in template mode.
 * The directive renders the template HTML as a sibling of its anchor, inside
 * this host element, so assertions run against `fixture.nativeElement`.
 */
@Component({
  selector: 'grafloria-html-node-host',
  standalone: true,
  imports: [HtmlNodeRendererDirective],
  template:
    '<ng-container [htmlNodeRenderer]="node" [nodeType]="nodeType" [engine]="engine"></ng-container>',
})
class HostComponent {
  node: any = null;
  nodeType = 'HTML';
  engine: any = null;
}

function makeTemplateNode(template: string, data: Record<string, any> = {}): any {
  return {
    id: 'node-1',
    data: {
      ...data,
      _html: { mode: 'template', template },
    },
  };
}

describe('HtmlNodeRendererDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [ComponentRendererService],
    });

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  describe('compiles and renders (regression for illegal /s regex flag)', () => {
    it('should instantiate the directive without a TypeScript/compile error', () => {
      host.node = makeTemplateNode('<div class="plain">static</div>');
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(fixture.nativeElement.querySelector('.plain')?.textContent).toBe(
        'static'
      );
    });

    it('should interpolate {{data.key}} values into the template', () => {
      host.node = makeTemplateNode('<div class="greeting">Hello {{data.name}}</div>', {
        name: 'World',
      });
      fixture.detectChanges();

      const el = fixture.nativeElement.querySelector('.greeting');
      expect(el).toBeTruthy();
      expect(el.textContent).toContain('Hello World');
    });

    it('should honor conditional blocks that span newlines (multiline / dotAll behavior)', () => {
      const template = [
        '<div class="wrap">',
        '{{#data.show}}',
        '<span class="shown">visible</span>',
        '{{/data.show}}',
        '</div>',
      ].join('\n');

      host.node = makeTemplateNode(template, { show: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.shown')).toBeTruthy();
    });

    it('should hide inverted conditional blocks when the value is truthy', () => {
      const template = [
        '<div class="wrap">',
        '{{^data.hidden}}',
        '<span class="maybe">maybe</span>',
        '{{/data.hidden}}',
        '</div>',
      ].join('\n');

      host.node = makeTemplateNode(template, { hidden: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.maybe')).toBeNull();
    });

    it('should render :loop iteration over array data across newlines', () => {
      const template =
        '<ul class="list">' +
        '<li :loop="${this.data.items}">\n{{self.label}}\n</li>' +
        '</ul>';

      host.node = makeTemplateNode(template, {
        items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
      });
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.list li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toContain('A');
      expect(items[2].textContent).toContain('C');
    });
  });

  describe('XSS: DATA values must not inject executable markup', () => {
    it('should strip <script> injected via {{data.*}}', () => {
      host.node = makeTemplateNode('<div class="out">{{data.name}}</div>', {
        name: '<script>window.__xss__ = true;</script>hi',
      });
      fixture.detectChanges();

      const rendered = fixture.nativeElement as HTMLElement;
      // No <script> element should have been materialized.
      expect(rendered.querySelector('script')).toBeNull();
      expect(rendered.innerHTML.toLowerCase()).not.toContain('<script');
    });

    it('should strip on* event handlers injected via {{data.*}}', () => {
      host.node = makeTemplateNode('<div class="out">{{data.name}}</div>', {
        name: '<img src="x" onerror="window.__xss__ = true">',
      });
      fixture.detectChanges();

      const rendered = fixture.nativeElement as HTMLElement;
      // The onerror attribute must be gone (sanitizer neutralizes it).
      const img = rendered.querySelector('img');
      if (img) {
        expect(img.getAttribute('onerror')).toBeNull();
      }
      expect(rendered.innerHTML.toLowerCase()).not.toContain('onerror');
    });

    it('should strip on* handlers injected via {{self.*}} loop data', () => {
      const template =
        '<ul class="list"><li :loop="${this.data.rows}">{{self.text}}</li></ul>';
      host.node = makeTemplateNode(template, {
        rows: [{ text: '<img src=x onerror="window.__xss__ = true">' }],
      });
      fixture.detectChanges();

      const rendered = fixture.nativeElement as HTMLElement;
      expect(rendered.innerHTML.toLowerCase()).not.toContain('onerror');
    });

    it('should not execute injected script (side-effect check)', () => {
      delete (window as any).__xss__;
      host.node = makeTemplateNode('<div>{{data.name}}</div>', {
        name: '<script>window.__xss__ = true;</script>',
      });
      fixture.detectChanges();

      expect((window as any).__xss__).toBeUndefined();
    });

    it('should preserve benign text from trusted template + safe data', () => {
      host.node = makeTemplateNode(
        '<div class="card"><b>{{data.title}}</b></div>',
        { title: 'Quarterly Report' }
      );
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.card');
      expect(card).toBeTruthy();
      // Trusted template markup (<b>) is preserved...
      expect(card.querySelector('b')).toBeTruthy();
      // ...and the safe data value is rendered.
      expect(card.textContent).toContain('Quarterly Report');
    });
  });
});
