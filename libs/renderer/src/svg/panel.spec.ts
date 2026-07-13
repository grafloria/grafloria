// Card 5 — composite / panel node model.

import {
  renderNodePanel,
  measurePanelReserve,
  panelAdjustedInnerRect,
  sanitizeAssetUrl,
  hasPanel,
  getNodePanel,
  type PanelRenderContext,
  type PanelSpec,
} from './panel';
import { SVGRenderer } from './svg-renderer';
import { VNodePainter } from '../canvas/vnode-painter';
import { CanvasStyleResolver } from '../canvas/style-resolution';
import { RecordingContext2D } from '../canvas/canvas-context';
import { IDENTITY } from '../canvas/path-geometry';
import { LIGHT_THEME } from '../themes';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

const CTX: PanelRenderContext = {
  nodeId: 'n1',
  fontSize: 12,
  headerFill: '#334155',
  headerTextColor: '#fff',
  bodyTextColor: '#111',
  badgeFill: '#ef4444',
  badgeTextColor: '#fff',
};

const nodeWith = (panel: PanelSpec): NodeModel => {
  const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 160, height: 120 } });
  node.setMetadata('panel', panel);
  return node;
};

const collectText = (vnodes: VNode[]): string[] =>
  vnodes.filter((v) => v.type === 'text').map((v) => String(v.props?.textContent ?? ''));

describe('Card 5 — panel spec plumbing', () => {
  it('detects a panel and reads it back', () => {
    const node = nodeWith({ header: { text: 'Users' } });
    expect(hasPanel(node)).toBe(true);
    expect(getNodePanel(node)?.header?.text).toBe('Users');
  });

  it('serializes as part of node metadata (round-trips)', () => {
    const node = nodeWith({ header: { text: 'T' }, rows: [{ text: 'id: int' }] });
    const restored = NodeModel.fromJSON(node.serialize());
    expect(getNodePanel(restored)?.rows?.[0].text).toBe('id: int');
  });
});

describe('Card 5 — renderNodePanel', () => {
  it('renders a header band rect + header text', () => {
    const vnodes = renderNodePanel(nodeWith({ header: { text: 'Users', height: 24 } }), 160, 120, CTX);
    const rect = vnodes.find((v) => v.type === 'rect');
    expect(rect?.props?.height).toBe(24);
    expect(collectText(vnodes)).toContain('Users');
  });

  it('renders an <image> for a safe href and OMITS the slot for a dangerous one', () => {
    const safe = renderNodePanel(
      nodeWith({ image: { href: 'data:image/png;base64,AAAA' } }),
      160,
      120,
      CTX
    );
    expect(safe.some((v) => v.type === 'image')).toBe(true);

    const evil = renderNodePanel(
      nodeWith({ image: { href: 'javascript:alert(1)' } }),
      160,
      120,
      CTX
    );
    expect(evil.some((v) => v.type === 'image')).toBe(false);
  });

  it('stacks ERD/UML rows and pins them to the bottom', () => {
    const vnodes = renderNodePanel(
      nodeWith({ rows: [{ text: 'id: int' }, { text: 'name: text' }], rowHeight: 20 }),
      160,
      120,
      CTX
    );
    expect(collectText(vnodes)).toEqual(['id: int', 'name: text']);
    const rowYs = vnodes.filter((v) => v.type === 'text').map((v) => Number(v.props?.y));
    // rows sit near the bottom (120 - 2*20 = 80 .. 120).
    expect(Math.min(...rowYs)).toBeGreaterThanOrEqual(80);
  });

  it('renders count badges via textContent (never innerHTML)', () => {
    const vnodes = renderNodePanel(
      nodeWith({ badges: [{ text: '9+' }, { text: '3', corner: 'tl' }] }),
      160,
      120,
      CTX
    );
    expect(collectText(vnodes)).toEqual(expect.arrayContaining(['9+', '3']));
    // No VNode uses innerHTML anywhere in the panel.
    expect(vnodes.some((v) => 'innerHTML' in (v.props ?? {}))).toBe(false);
  });

  it('renders an emoji icon as text when no href is given', () => {
    const vnodes = renderNodePanel(nodeWith({ icon: { glyph: '★', corner: 'tr' } }), 160, 120, CTX);
    expect(collectText(vnodes)).toContain('★');
  });

  it('is empty for a plain node', () => {
    const plain = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 80, height: 40 } });
    expect(renderNodePanel(plain, 80, 40, CTX)).toEqual([]);
  });
});

describe('Card 5 — sanitizeAssetUrl', () => {
  it('permits raster data URIs and http(s)', () => {
    expect(sanitizeAssetUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(sanitizeAssetUrl('https://x/y.png')).toBe('https://x/y.png');
  });
  it('blocks javascript:, vbscript:, data:text/html and svg data URIs', () => {
    expect(sanitizeAssetUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeAssetUrl('  JAVA\tSCRIPT:alert(1)')).toBe('');
    expect(sanitizeAssetUrl('data:text/html,<script>')).toBe('');
    expect(sanitizeAssetUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe('');
    expect(sanitizeAssetUrl(42 as unknown)).toBe('');
  });
});

describe('Card 5 — label composition (panel-adjusted inner rect)', () => {
  it('shrinks the label band to clear the header + rows', () => {
    const node = nodeWith({ header: { height: 24 }, rows: [{ text: 'a' }], rowHeight: 20 });
    const inner = { x: 0, y: 0, w: 160, h: 120 };
    const adj = panelAdjustedInnerRect(node, inner, 160, 120);
    expect(adj.y).toBeGreaterThanOrEqual(24); // below the header
    expect(adj.y + adj.h).toBeLessThanOrEqual(120 - 20); // above the rows
  });
});

describe('Card 5 — composes with any base shape through the real renderer', () => {
  it('a cylinder node emits both its <path> body AND the panel header band', () => {
    const engine = new DiagramEngine();
    engine.createDiagram();
    const node = new NodeModel({ type: 'default', position: { x: 0, y: 0 }, size: { width: 160, height: 120 } });
    node.setMetadata('shape', { type: 'cylinder' });
    node.setMetadata('panel', { header: { text: 'DB' } });
    engine.getDiagram()!.addNode(node);

    const renderer = new SVGRenderer(engine);
    const tree = renderer.render({ x: -50, y: -50, width: 400, height: 400 }, 1);
    const flat = JSON.stringify(tree);
    // cylinder body path present …
    expect(flat).toContain('"path"');
    // … and the panel header text.
    expect(flat).toContain('DB');
  });
});

describe('Card 5 — degrades sanely in Canvas mode', () => {
  it('paints panel bands/rows/text but reports the image slot as unpaintable', () => {
    const panel: PanelSpec = {
      header: { text: 'Users' },
      image: { href: 'data:image/png;base64,AAAA' },
      rows: [{ text: 'id' }],
    };
    const group: VNode = {
      type: 'g',
      key: 'node-n1',
      props: {},
      children: renderNodePanel(nodeWith(panel), 160, 120, CTX),
    };
    const painter = new VNodePainter(new CanvasStyleResolver({ theme: LIGHT_THEME }));
    const result = painter.paint(new RecordingContext2D() as any, group, { worldToDevice: IDENTITY });
    // The <image> is reported for host overlay …
    expect(result.unpaintableNodes.some((v) => v.type === 'image')).toBe(true);
    // … while the header band + text painted (something was drawn).
    expect(result.paintedCount).toBeGreaterThan(0);
  });
});
