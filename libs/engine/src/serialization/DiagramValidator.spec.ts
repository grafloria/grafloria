import { validateSerializedDiagram } from './DiagramValidator';
import type { SerializedDiagram } from '../models/DiagramModel';

function doc(overrides: Partial<SerializedDiagram> = {}): SerializedDiagram {
  return {
    id: 'd1',
    uuid: 'uuid-d1',
    type: 'diagram',
    version: 1,
    schemaVersion: 2,
    metadata: {},
    name: 'doc',
    nodes: [],
    links: [],
    groups: [],
    viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
    ...overrides,
  } as SerializedDiagram;
}

const node = (id: string, ports: Array<{ id: string }> = []) =>
  ({
    id,
    uuid: `uuid-${id}`,
    type: 'rect',
    version: 1,
    metadata: {},
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    scale: 1,
    children: [],
    state: {},
    behavior: {},
    style: {},
    data: {},
    ports: ports.map((p) => ({
      id: p.id,
      uuid: `uuid-${p.id}`,
      type: 'bi',
      version: 1,
      metadata: {},
      nodeId: id,
      position: { x: 0, y: 0 },
      alignment: { side: 'right', offset: 0 },
      offset: { x: 0, y: 0 },
      index: 0,
      maxConnections: Infinity,
      allowedTypes: [],
      visible: true,
      style: {},
      data: {},
    })),
  }) as any;

const link = (id: string, sourcePortId: string, targetPortId: string) =>
  ({
    id,
    uuid: `uuid-${id}`,
    type: 'link',
    version: 1,
    metadata: {},
    sourcePortId,
    targetPortId,
    pathType: 'direct',
    points: [],
    segments: [],
    labels: [],
    state: 'default',
    style: {},
    data: {},
  }) as any;

const group = (id: string, members: string[] = [], parentGroupId?: string) =>
  ({
    id,
    uuid: `uuid-${id}`,
    type: 'group',
    version: 1,
    metadata: {},
    name: id,
    members,
    isCollapsed: false,
    bounds: undefined,
    parentGroupId,
  }) as any;

describe('validateSerializedDiagram', () => {
  it('passes a clean document', () => {
    const report = validateSerializedDiagram(
      doc({
        nodes: [node('n1', [{ id: 'p1' }]), node('n2', [{ id: 'p2' }])],
        links: [link('l1', 'p1', 'p2')],
        groups: [group('g1', ['n1'])],
      })
    );
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('flags duplicate ids across collections', () => {
    const report = validateSerializedDiagram(
      doc({ nodes: [node('same')], groups: [group('same')] })
    );
    expect(report.ok).toBe(false);
    expect(report.errors[0].code).toBe('duplicate-id');
  });

  it('flags duplicate port ids across nodes', () => {
    const report = validateSerializedDiagram(
      doc({ nodes: [node('n1', [{ id: 'p' }]), node('n2', [{ id: 'p' }])] })
    );
    expect(report.errors.map((e) => e.code)).toContain('duplicate-port-id');
  });

  it('flags dangling link endpoints', () => {
    const report = validateSerializedDiagram(
      doc({ nodes: [node('n1', [{ id: 'p1' }])], links: [link('l1', 'p1', 'ghost')] })
    );
    const finding = report.errors.find((e) => e.code === 'dangling-link-endpoint');
    expect(finding).toBeDefined();
    expect(finding!.entityId).toBe('l1');
  });

  it('warns on a missing node parent (load-degraded, not fatal)', () => {
    const orphan = node('n1');
    orphan.parentId = 'missing-parent';
    const report = validateSerializedDiagram(doc({ nodes: [orphan] }));
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => w.code)).toContain('missing-parent');
  });

  it('warns on missing group members, errors on missing parent group', () => {
    const report = validateSerializedDiagram(
      doc({ groups: [group('g1', ['ghost-node'], 'ghost-parent')] })
    );
    expect(report.warnings.map((w) => w.code)).toContain('missing-group-member');
    expect(report.errors.map((e) => e.code)).toContain('missing-parent-group');
  });

  it('detects group containment cycles', () => {
    const report = validateSerializedDiagram(
      doc({ groups: [group('a', [], 'b'), group('b', [], 'a')] })
    );
    expect(report.errors.map((e) => e.code)).toContain('group-cycle');
  });
});
