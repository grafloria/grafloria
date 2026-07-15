import {
  DIAGRAM_SCHEMA_VERSION,
  registerDiagramMigration,
  runDiagramMigrations,
  getDiagramMigrations,
  type DiagramMigration,
} from './DiagramMigrations';
import type { SerializedDiagram } from '../models/DiagramModel';

function doc(overrides: Partial<SerializedDiagram> = {}): SerializedDiagram {
  return {
    id: 'd1',
    uuid: 'uuid-d1',
    type: 'diagram',
    version: 1,
    metadata: {},
    name: 'doc',
    nodes: [],
    links: [],
    groups: [],
    viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
    ...overrides,
  } as SerializedDiagram;
}

describe('runDiagramMigrations', () => {
  it('treats a document without schemaVersion as v1 and upgrades it to current', () => {
    const legacy = doc();
    delete (legacy as any).schemaVersion;
    const migrated = runDiagramMigrations(legacy);
    expect(migrated.schemaVersion).toBe(DIAGRAM_SCHEMA_VERSION);
  });

  it('passes a current document through unchanged', () => {
    const current = doc({ schemaVersion: DIAGRAM_SCHEMA_VERSION });
    expect(runDiagramMigrations(current)).toBe(current);
  });

  it('the built-in v1→v2 step normalizes groups and strips leaked runtime metadata', () => {
    const legacy = doc({
      groups: [
        {
          id: 'g1',
          uuid: 'uuid-g1',
          type: 'group',
          version: 1,
          // a pre-unified writer leaked the live back-reference key
          metadata: { diagram: { leaked: true }, keep: 'me' },
          name: 'G',
          members: [],
          isCollapsed: false,
          bounds: undefined,
        } as any,
      ],
    });
    delete (legacy as any).schemaVersion;

    const migrated = runDiagramMigrations(legacy);
    expect(migrated.groups[0].metadata).toEqual({ keep: 'me' });

    const noGroups = doc();
    delete (noGroups as any).schemaVersion;
    delete (noGroups as any).groups;
    expect(runDiagramMigrations(noGroups).groups).toEqual([]);
  });

  it('refuses documents newer than the runtime', () => {
    const future = doc({ schemaVersion: DIAGRAM_SCHEMA_VERSION + 5 });
    expect(() => runDiagramMigrations(future)).toThrow(/newer|refusing/i);
  });

  it('throws on a gap in the chain instead of part-loading', () => {
    // isolated chain override: only 1→2 exists, document needs 0→…
    const chain: DiagramMigration[] = [
      { from: 1, to: 2, description: 'only step', migrate: (d) => ({ ...d, schemaVersion: 2 }) },
    ];
    const ancient = doc({ schemaVersion: 0 } as any);
    expect(() => runDiagramMigrations(ancient, chain)).toThrow(/No diagram migration/i);
  });

  it('runs an override chain stepwise and stamps each step', () => {
    const trail: number[] = [];
    const chain: DiagramMigration[] = [
      {
        from: 1,
        to: 2,
        description: 't1',
        migrate: (d) => {
          trail.push(1);
          return { ...d, schemaVersion: 2 };
        },
      },
      {
        // wave13: DIAGRAM_SCHEMA_VERSION moved to 3 (positionMode-on-parents), so an
        // override chain must reach it — stepwise is exactly what this test asserts.
        from: 2,
        to: 3,
        description: 't2',
        migrate: (d) => {
          trail.push(2);
          return { ...d, schemaVersion: 3 };
        },
      },
    ];
    const legacy = doc();
    delete (legacy as any).schemaVersion;
    const migrated = runDiagramMigrations(legacy, chain);
    expect(trail).toEqual([1, 2]);
    expect(migrated.schemaVersion).toBe(3);
  });
});

describe('registerDiagramMigration', () => {
  it('rejects multi-step and duplicate registrations', () => {
    expect(() =>
      registerDiagramMigration({
        from: 5,
        to: 7,
        description: 'bad jump',
        migrate: (d) => d,
      })
    ).toThrow(/exactly one step/i);

    // the built-in 1→2 exists — a second 1→x must be rejected
    expect(() =>
      registerDiagramMigration({
        from: 1,
        to: 2,
        description: 'dup',
        migrate: (d) => d,
      })
    ).toThrow(/already registered/i);
  });

  it('exposes the built-in chain', () => {
    const froms = getDiagramMigrations().map((m) => m.from);
    expect(froms).toContain(1);
  });
});
