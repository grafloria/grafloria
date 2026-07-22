/**
 * <grafloria-diagram> — one generic host for every kit spec. Proven with the
 * ER and UML kits: pure data in, painted diagram out.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GrafloriaDiagramComponent } from './grafloria-diagram.component';
import { erDiagram, umlDiagram } from '@grafloria/element';

/**
 * jsdom lays nothing out — give every element a real box so the camera is not 0x0.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('<grafloria-diagram> — the generic kit host', () => {
  it('renders an ER diagram from pure data', async () => {
    @Component({
      imports: [GrafloriaDiagramComponent],
      template: `<grafloria-diagram style="display:block;width:800px;height:600px" [spec]="spec" />`,
    })
    class ErHost {
      spec = erDiagram({
        entities: [
          { id: 'PRODUCTS', name: 'Products', position: { x: 40, y: 40 }, columns: [
            { name: 'id', type: 'int', pk: true }, { name: 'sku', type: 'varchar' } ] },
          { id: 'ORDERS', name: 'Orders', position: { x: 400, y: 40 }, columns: [
            { name: 'id', type: 'int', pk: true }, { name: 'product_id', type: 'int', fk: true } ] },
        ],
        relationships: [{ from: 'ORDERS', to: 'PRODUCTS' }],
      });
    }
    await TestBed.configureTestingModule({ imports: [ErHost] }).compileComponents();
    const fixture = TestBed.createComponent(ErHost);
    fixture.detectChanges();
    // paint is rAF-scheduled — flush deterministically
    fixture.debugElement.query(By.directive(GrafloriaDiagramComponent)).componentInstance.getInstance()!.renderNow();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Products');
    expect(el.textContent).toContain('sku');
    expect(el.textContent).toContain('Orders');
    fixture.destroy();
  });

  it('renders a UML class diagram from pure data', async () => {
    @Component({
      imports: [GrafloriaDiagramComponent],
      template: `<grafloria-diagram style="display:block;width:800px;height:600px" [spec]="spec" />`,
    })
    class UmlHost {
      spec = umlDiagram({
        classes: [
          { id: 'Animal', abstract: true, position: { x: 200, y: 40 },
            attributes: ['# name: String'], methods: ['+ speak(): void'] },
          { id: 'Dog', position: { x: 200, y: 300 }, attributes: ['+ breed: String'], methods: [] },
        ],
        relationships: [{ from: 'Dog', to: 'Animal', kind: 'inheritance' }],
      });
    }
    await TestBed.configureTestingModule({ imports: [UmlHost] }).compileComponents();
    const fixture = TestBed.createComponent(UmlHost);
    fixture.detectChanges();
    fixture.debugElement.query(By.directive(GrafloriaDiagramComponent)).componentInstance.getInstance()!.renderNow();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Animal');
    expect(el.textContent).toContain('+ speak(): void');
    fixture.destroy();
  });
});
