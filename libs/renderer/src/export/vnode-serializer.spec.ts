// The VNode → XML primitive, on its own. Pure input/output — no engine, no DOM.

import { serializeVNode, escapeAttr, escapeText } from './vnode-serializer';
import type { VNode } from '../types/vnode.types';

describe('serializeVNode', () => {
  it('serializes an element with kebab-cased attributes', () => {
    const vnode: VNode = {
      type: 'rect',
      props: { x: 1, y: 2, width: 30, height: 40, strokeWidth: 2, fill: '#fff' },
    };
    expect(serializeVNode(vnode)).toBe(
      '<rect x="1" y="2" width="30" height="40" stroke-width="2" fill="#fff"/>'
    );
  });

  it('keeps genuinely-camelCase SVG attributes verbatim (the patcher\'s VERBATIM_ATTRS)', () => {
    const vnode: VNode = {
      type: 'linearGradient',
      props: { id: 'g1', gradientUnits: 'userSpaceOnUse', gradientTransform: 'rotate(45)' },
      children: [{ type: 'stop', props: { offset: 0, 'stop-color': '#f00' } }],
    };
    const svg = serializeVNode(vnode);
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('gradientTransform="rotate(45)"');
    expect(svg).not.toContain('gradient-units');
  });

  it('maps className → class, and an SVG element\'s style becomes presentation attributes', () => {
    // `cursor` is CSS-only noise in a still picture and is dropped; `pointer-events`
    // is a real presentation attribute and survives.
    const vnode: VNode = {
      type: 'circle',
      props: { className: 'port port-input', style: { pointerEvents: 'all', cursor: 'pointer' } },
    };
    expect(serializeVNode(vnode)).toBe('<circle class="port port-input" pointer-events="all"/>');
  });

  it('renders textContent as escaped text, not as an attribute', () => {
    const vnode: VNode = { type: 'text', props: { x: 0, textContent: 'a < b & "c"' } };
    expect(serializeVNode(vnode)).toBe('<text x="0">a &lt; b &amp; "c"</text>');
  });

  it('escapes attribute values', () => {
    const vnode: VNode = { type: 'g', props: { 'data-label': 'a "quoted" <tag> & amp' } };
    expect(serializeVNode(vnode)).toBe(
      '<g data-label="a &quot;quoted&quot; &lt;tag&gt; &amp; amp"/>'
    );
  });

  it('drops event handlers instead of stringifying a function into the output', () => {
    const vnode: VNode = {
      type: 'rect',
      props: { x: 0, onClick: () => undefined, onMouseEnter: () => undefined },
    };
    expect(serializeVNode(vnode)).toBe('<rect x="0"/>');
  });

  it('drops null/undefined props', () => {
    const vnode: VNode = { type: 'rect', props: { x: 0, fill: undefined, stroke: null as any } };
    expect(serializeVNode(vnode)).toBe('<rect x="0"/>');
  });

  it('drops the live-pipeline-only props that would destroy determinism', () => {
    // Both are minted from PROCESS-GLOBAL counters: keeping them would make the
    // bytes depend on how many renderers/foreignObjects the process created first.
    const vnode: VNode = {
      type: 'g',
      props: { 'data-grafloria-instance': 'grafloria-7', containerId: 'fo-node-1-3', x: 0 },
    };
    const svg = serializeVNode(vnode);
    expect(svg).toBe('<g x="0"/>');
    expect(svg).not.toContain('grafloria-7');
    expect(svg).not.toContain('container');
  });

  it('skips empty child slots exactly like the patcher does', () => {
    const vnode: VNode = {
      type: 'g',
      props: {},
      children: [null as any, { type: 'rect', props: { x: 1 } }, undefined as any],
    };
    expect(serializeVNode(vnode)).toBe('<g><rect x="1"/></g>');
  });

  it('nests children and self-closes empty elements', () => {
    const vnode: VNode = {
      type: 'g',
      props: { transform: 'translate(1, 2)' },
      children: [
        { type: 'rect', props: { x: 0 } },
        { type: 'text', props: { textContent: 'hi' } },
      ],
    };
    expect(serializeVNode(vnode)).toBe(
      '<g transform="translate(1, 2)"><rect x="0"/><text>hi</text></g>'
    );
  });

  describe('CSS priority order', () => {
    const resolver = () => ({ fill: '#theme', stroke: '#themestroke' });

    it('a class rule beats a presentation attribute (as it does in the browser)', () => {
      const vnode: VNode = { type: 'rect', props: { className: 'diagram-node', fill: '#attr' } };
      const svg = serializeVNode(vnode, { classStyles: resolver });
      // one fill attribute, carrying the STYLESHEET's value
      expect(svg.match(/fill=/g)).toHaveLength(1);
      expect(svg).toContain('fill="#theme"');
      expect(svg).not.toContain('#attr');
    });

    it('an inline style beats the class rule — and collapses into the ONE fill attribute', () => {
      const vnode: VNode = {
        type: 'rect',
        props: { className: 'diagram-node', fill: '#attr', style: 'fill: #inline' as any },
      };
      const svg = serializeVNode(vnode, { classStyles: resolver });

      // Exactly one fill, carrying the cascade's winner. Leaving the losing
      // `fill="#theme"` behind next to a `style="fill: #inline"` would render
      // correctly in a browser and WRONG in any consumer that skips inline CSS.
      expect(svg.match(/fill=/g)).toHaveLength(1);
      expect(svg).toContain('fill="#inline"');
      expect(svg).not.toContain('style=');
      expect(svg).toContain('stroke="#themestroke"'); // untouched rule value survives
    });

    it('keeps the style attribute for HTML inside a foreignObject (HTML has no presentation attributes)', () => {
      const fo: VNode = {
        type: 'foreignObject',
        props: { width: 10, height: 10 },
        children: [
          {
            type: 'div',
            props: { xmlns: 'http://www.w3.org/1999/xhtml', style: { width: '100%', color: 'red' } },
          },
        ],
      };
      const svg = serializeVNode(fo, { classStyles: resolver });
      expect(svg).toContain('<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;color:red"/>');
    });

    it('no resolver → nothing is flattened (programmatic-mode trees are already inline)', () => {
      const vnode: VNode = { type: 'rect', props: { className: 'diagram-node', fill: '#attr' } };
      expect(serializeVNode(vnode)).toBe('<rect class="diagram-node" fill="#attr"/>');
    });
  });

  describe('filter: blur() → a real SVG filter', () => {
    it('translates the CSS shorthand and registers ONE def per radius', () => {
      const extraDefs = new Map<string, string>();
      const shadow: VNode = { type: 'rect', props: { filter: 'blur(4px)' } };

      expect(serializeVNode(shadow, { extraDefs })).toBe('<rect filter="url(#grafloria-blur-4)"/>');
      // a second shadow with the same radius reuses the def
      serializeVNode(shadow, { extraDefs });

      expect(extraDefs.size).toBe(1);
      expect(extraDefs.get('grafloria-blur-4')).toContain('<feGaussianBlur stdDeviation="2"/>');
    });

    it('passes a url(#…) filter through untouched', () => {
      const vnode: VNode = { type: 'rect', props: { filter: 'url(#grafloria-def-abc)' } };
      expect(serializeVNode(vnode)).toBe('<rect filter="url(#grafloria-def-abc)"/>');
    });
  });

  describe('foreignObject', () => {
    const fo: VNode = {
      type: 'foreignObject',
      props: { x: 0, y: 0, width: 100, height: 50, containerId: 'fo-n1-1' },
      children: [
        {
          type: 'div',
          props: { xmlns: 'http://www.w3.org/1999/xhtml', style: { width: '100%' } },
          children: [],
        },
      ],
    };

    it('serialize (default): emits the declared subtree and WARNS that host-mounted HTML is not in the tree', () => {
      const warnings: string[] = [];
      const svg = serializeVNode(fo, { warnings });
      expect(svg).toContain('<foreignObject x="0" y="0" width="100" height="50">');
      expect(svg).toContain('<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%"/>');
      expect(warnings.join('\n')).toMatch(/host-mounted/i);
    });

    it('placeholder: a dashed rect of the same geometry (a thumbnail shows a box, not a hole)', () => {
      const svg = serializeVNode(fo, { foreignObject: 'placeholder' });
      expect(svg).toContain('<rect x="0" y="0" width="100" height="50"');
      expect(svg).toContain('stroke-dasharray="4,4"');
      expect(svg).not.toContain('foreignObject');
    });

    it('omit: drops it entirely', () => {
      expect(serializeVNode(fo, { foreignObject: 'omit' })).toBe('');
    });

    it('captureForeignObject: a caller WITH a live DOM can supply the real markup', () => {
      const svg = serializeVNode(fo, {
        captureForeignObject: () => '<div xmlns="http://www.w3.org/1999/xhtml">real content</div>',
      });
      expect(svg).toContain('>real content</div></foreignObject>');
    });
  });

  describe('escaping helpers', () => {
    it('escapeAttr covers & < > "', () => {
      expect(escapeAttr('&<>"')).toBe('&amp;&lt;&gt;&quot;');
    });

    it('escapeText covers & < > and leaves quotes alone', () => {
      expect(escapeText('&<>"')).toBe('&amp;&lt;&gt;"');
    });
  });
});
