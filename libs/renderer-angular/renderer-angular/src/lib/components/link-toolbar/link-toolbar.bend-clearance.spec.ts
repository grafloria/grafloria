/**
 * The link toolbar never sits on a bend of its link — the bend's handle must stay
 * grabbable. The docs review: on edit-edge-routes the toolbar's default place
 * (midpoint, lifted 22 px) covered the saved bend at (350, 210), so the bend
 * could not be dragged.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { LinkToolbarComponent } from './link-toolbar.component';
import { createDefaultLinkActions } from './link-toolbar-actions';

const SIZE = { width: 61, height: 28 };

describe('LinkToolbarComponent — keeps clear of the bends', () => {
  let fixture: ComponentFixture<LinkToolbarComponent>;
  let component: LinkToolbarComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let link: LinkModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkToolbarComponent] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('bends')!;
    for (const [id, x, y, side] of [['p1', 60, 180, 'right'], ['p2', 540, 80, 'left']] as const) {
      const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 120, height: 60 } });
      node.addPort(new PortModel({ id, type: side === 'right' ? 'output' : 'input', side }));
      diagram.addNode(node);
    }
    link = new LinkModel('p1', 'p2', 'direct');
    diagram.addLink(link);
    link.points = [{ x: 180, y: 210 }, { x: 350, y: 210 }, { x: 540, y: 110 }];

    fixture = TestBed.createComponent(LinkToolbarComponent);
    component = fixture.componentInstance;
    component.link = link;
    component.engine = engine;
    component.viewport = { x: 0, y: 0, width: 800, height: 600 };
    component.zoom = 1;
    component.actions = createDefaultLinkActions(engine);
    fixture.detectChanges();
    // jsdom lays nothing out: give the toolbar its real on-screen size.
    component.toolbarRef!.nativeElement.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: SIZE.width, bottom: SIZE.height, ...SIZE, toJSON: () => ({}) }) as DOMRect;
  });
  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  const rect = () => {
    const m = component.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!;
    const x = parseFloat(m[1]), y = parseFloat(m[2]);
    return { x, y, right: x + SIZE.width, bottom: y + SIZE.height };
  };
  const covers = (p: { x: number; y: number }, pad: number) => {
    const r = rect();
    return p.x >= r.x - pad && p.x <= r.right + pad && p.y >= r.y - pad && p.y <= r.bottom + pad;
  };

  it('the default place (midpoint, lifted) does not cover the saved bend', () => {
    component.updatePosition();
    expect(covers({ x: 350, y: 210 }, 6)).toBe(false);
  });

  it('it still sits near the anchor (not parked somewhere far away)', () => {
    component.updatePosition();
    const r = rect();
    const cx = (r.x + r.right) / 2, cy = (r.y + r.bottom) / 2;
    expect(Math.hypot(cx - 370, cy - 200)).toBeLessThan(120);
  });

  it('a straight link with no bends keeps the old place exactly (control)', () => {
    link.points = [{ x: 180, y: 210 }, { x: 540, y: 210 }];
    component.updatePosition();
    const r = rect();
    expect({ x: r.x, y: r.y }).toEqual({ x: Math.round(360 - SIZE.width / 2), y: Math.round(210 + 22 - SIZE.height / 2) });
  });
});
