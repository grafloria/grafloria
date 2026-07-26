// Panel icon anchor 'c' — the centred badge slot (master-sheet audit, finding 2).
//
// BPMN paints an event's trigger glyph in the MIDDLE of its circle; the panel's
// icon slot only knew the four corners. `corner: 'c'` centres the box in the
// node body. Corners are untouched (regression-guarded here too).

import { renderNodePanel } from './panel';
import { NodeModel } from '@grafloria/engine';

const ctx = {
  nodeId: 'n1',
  fontSize: 12,
  headerFill: '#eee',
  headerTextColor: '#111',
  bodyTextColor: '#111',
  badgeFill: '#ddd',
  badgeTextColor: '#111',
};

const nodeWith = (panel: unknown): NodeModel => {
  const node = new NodeModel({ type: 't', position: { x: 0, y: 0 }, size: { width: 36, height: 36 } });
  node.setMetadata('panel', panel);
  return node;
};

describe("panel icon corner: 'c'", () => {
  it('centres a glyph icon in the node body', () => {
    const out = renderNodePanel(nodeWith({ icon: { glyph: '✉', size: 16, corner: 'c' } }), 36, 36, ctx);
    expect(out).toHaveLength(1);
    const icon = out[0];
    expect(icon.type).toBe('text');
    // box (16×16) centred in 36×36 → origin (10,10); text anchors at box middle
    expect(icon.props['x']).toBe(18);
    expect(icon.props['y']).toBe(18);
    expect(icon.props['textContent']).toBe('✉');
  });

  it('corner anchors still resolve exactly as before', () => {
    const tl = renderNodePanel(nodeWith({ icon: { glyph: '⚡', size: 16, corner: 'tl' } }), 36, 36, ctx)[0];
    expect(tl.props['x']).toBe(2 + 8); // inset 2 + size/2
    expect(tl.props['y']).toBe(2 + 8);
    const br = renderNodePanel(nodeWith({ icon: { glyph: '⚡', size: 16, corner: 'br' } }), 36, 36, ctx)[0];
    expect(br.props['x']).toBe(36 - 16 - 2 + 8);
    expect(br.props['y']).toBe(36 - 16 - 2 + 8);
  });
});
