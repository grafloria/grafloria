// A real diagram, built the way the app builds one — shared by the canvas specs
// so every backend test drives the SAME scene the SVG backend renders, rather
// than a hand-written VNode tree that only proves the painter agrees with itself.
//
// (Not a spec file: it carries no tests, it is imported by them.)

import { DiagramEngine, LinkModel, NodeModel, type PortModel } from '@grafloria/engine';

export interface TestScene {
  engine: DiagramEngine;
  diagram: ReturnType<DiagramEngine['createDiagram']>;
  nodes: Record<string, NodeModel>;
  links: Record<string, LinkModel>;
}

export interface SceneNodeSpec {
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  shape?: string;
  label?: string;
}

/** The node's own port on `side`. `NodeModel` creates one per side by default. */
export function portOn(node: NodeModel, side: 'left' | 'right' | 'top' | 'bottom'): PortModel {
  const port = node.getPorts().find((p) => p.side === side);
  if (!port) throw new Error(`node has no ${side} port`);
  return port;
}

/**
 * A diagram with the given nodes and (optionally) a link from the first node's
 * RIGHT port to the second node's LEFT port.
 *
 * Uses the ports `NodeModel` creates for itself (one `bi` port per side) rather
 * than inventing new ones — so the scene is the shape the app actually renders.
 */
export function buildScene(specs: SceneNodeSpec[], link = true): TestScene {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('Canvas Test')!;

  const nodes: Record<string, NodeModel> = {};

  for (const spec of specs) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: spec.x, y: spec.y },
      size: { width: spec.width ?? 120, height: spec.height ?? 60 },
    });
    if (spec.shape) node.setMetadata('shape', { type: spec.shape });
    if (spec.label) node.setMetadata('label', spec.label);

    diagram.addNode(node);
    nodes[spec.name] = node;
  }

  const links: Record<string, LinkModel> = {};
  if (link && specs.length >= 2) {
    const source = portOn(nodes[specs[0].name], 'right');
    const target = portOn(nodes[specs[1].name], 'left');
    const l = new LinkModel(source.id, target.id);
    diagram.addLink(l);
    links['main'] = l;
  }

  return { engine, diagram, nodes, links };
}

export const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };
