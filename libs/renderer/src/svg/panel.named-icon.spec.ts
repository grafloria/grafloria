// Panel icon `name` — Grafloria's own line icons (cloud, database, disk,
// internet, server): the five Mermaid architecture-beta ships. An href icon must
// be a RASTER data URI (SVG data URIs are refused: SVG can carry script), so a
// vector icon is drawn as our own paths instead — nothing fetched, nothing
// parsed from user data, the node's ink colour, scaled to the slot.

import { renderNodePanel, BUILTIN_ICONS } from './panel';
import { NodeModel } from '@grafloria/engine';

const ctx = {
  nodeId: 'n1',
  fontSize: 12,
  headerFill: '#eee',
  headerTextColor: '#111',
  bodyTextColor: '#334155',
  badgeFill: '#ddd',
  badgeTextColor: '#111',
};

const nodeWith = (panel: unknown): NodeModel => {
  const node = new NodeModel({ type: 't', position: { x: 0, y: 0 }, size: { width: 160, height: 60 } });
  node.setMetadata('panel', panel);
  return node;
};

describe('panel icon by name', () => {
  it('has the five Mermaid architecture icons', () => {
    expect(Object.keys(BUILTIN_ICONS).sort()).toEqual(['cloud', 'database', 'disk', 'internet', 'server']);
  });

  it('draws a named icon as paths in the node ink, scaled into its corner slot', () => {
    const out = renderNodePanel(nodeWith({ icon: { name: 'database', size: 20, corner: 'tl' } }), 160, 60, ctx);
    expect(out).toHaveLength(1);
    const g = out[0]!;
    expect(g.type).toBe('g');
    expect(g.props['className']).toBe('panel-icon');
    expect(String(g.props['transform'])).toBe('translate(2, 2) scale(0.8333)'); // 20 / 24
    const paths = (g.children ?? []) as Array<{ type: string; props: Record<string, unknown> }>;
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.type).toBe('path');
      expect(p.props['stroke']).toBe('#334155');
      expect(p.props['fill']).toBe('none');
    }
  });

  it('an unknown name draws nothing (never a broken box)', () => {
    expect(renderNodePanel(nodeWith({ icon: { name: 'logos:aws-lambda' } }), 160, 60, ctx)).toHaveLength(0);
  });

  it('an href or glyph still wins as before', () => {
    const out = renderNodePanel(nodeWith({ icon: { name: 'database', glyph: '★' } }), 160, 60, ctx);
    expect(out[0]!.type).toBe('text');
  });
});
