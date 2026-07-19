/**
 * THE REACHABILITY LOCK — INVERTED (Phase 0).
 *
 * ## What this file used to be
 *
 * Wave 10 built the demo gallery and immediately hit a wall: not one demo for
 * styling, collaboration or export could be written, because `@grafloria/element` —
 * the package an embedder actually installs — re-exported exactly THREE runtime
 * values: `renderToStaticSVG`, `LIGHT_THEME`, `DARK_THEME`. Everything else was
 * built, unit-tested, green, exported from `@grafloria/renderer` or `@grafloria/engine`
 * — and then filtered out one layer later at the package boundary.
 *
 * The fix at the time was a hand-written REQUIRED list here: ~90 names, each
 * asserted reachable. That worked, and it held for what it listed.
 *
 * ## Why it was not enough
 *
 * An allowlist is DEFAULT-DENY. It can only ever catch a REGRESSION of a
 * capability someone already thought to list; it is structurally blind to a
 * capability nobody listed. So the same bug kept accruing quietly underneath a
 * green test. An audit of the full export graph found **207 capability-level
 * symbols** — classes and factories — live in `@grafloria/engine` / `@grafloria/renderer`
 * and unreachable from this package. Among them: `DiagramEngine`, `DiagramModel`,
 * `NodeModel`, `LinkModel`, `Command`, `CommandManager`, `EventBus`,
 * `RoutingEngine`, `LayoutRegistry`, `PluginManager`, `SelectionToolsController`,
 * `KeyboardNavigationController`, `InPlaceTextEditor`, and all 30 undoable
 * commands. An embedder could render a diagram but could not name the class of
 * the thing they were rendering, nor issue a single undoable edit.
 *
 * The corroborating evidence was in this very repo: `apps/renderer-demo` — which
 * contains a dashboard builder, a workflow builder and an ERD designer, exactly
 * the apps this package exists to enable — imports `@grafloria/engine` in 41 files
 * and `@grafloria/element` in ZERO. The front door was not usable, so the flagship
 * app walked around it.
 *
 * ## What this file is now
 *
 * The polarity is flipped. `index.ts` re-exports both lower packages wholesale,
 * and this lock enumerates every capability-level symbol they export and asserts
 * it is reachable from here — BY IDENTITY, not merely by name. A new capability
 * added downstairs is reachable automatically; if anything ever filters one out
 * again, THIS TEST GOES RED with the symbol named, and the only ways to green
 * are to export it or to record it in WITHHELD with a written reason.
 *
 * That is the whole point: the failure mode is no longer silence.
 */
import * as Engine from '@grafloria/engine';
import * as Renderer from '@grafloria/renderer';
import * as Element from './index';

/**
 * A "capability" is something an app DRIVES: a class it constructs, or a
 * factory/registrar it calls. Both are runtime functions, which is why this
 * lock runs against real module objects rather than the type graph — reachable
 * to the type checker but absent at runtime is not reachable at all.
 *
 * Deliberately NOT capabilities: plain data constants, enums, predicates
 * (`isFoo`), and pure helpers. Those ride along with the wholesale re-export;
 * they simply are not what this lock is defending.
 */
const CAPABILITY_PREFIX = /^(register|create|define|build|attach|bind|install|make|serve)[A-Z]/;
const isCapability = (name: string, value: unknown): boolean => {
  if (typeof value !== 'function') return false;
  if (CAPABILITY_PREFIX.test(name)) return true;
  // A class: PascalCase. Excludes camelCase helpers and SCREAMING constants.
  return /^[A-Z][a-zA-Z0-9]*$/.test(name) && name !== name.toUpperCase();
};

/**
 * Capabilities deliberately NOT reachable under their own name, each with the
 * reason. This is the pressure valve — and the point is that using it costs a
 * sentence of justification in the diff, where a reviewer sees it.
 *
 * It is EMPTY, and that is the honest state of the package: after the
 * inversion, every capability-level symbol in both lower packages is reachable
 * from here under its own name. The three name collisions between the packages
 * (`distanceToSegment`, `rotatePoint`, `coalesce`) do not appear here because
 * they are camelCase helpers, not capabilities — the sweep never enumerates
 * them. They are aliased in `index.ts` anyway so neither side is lost.
 *
 * Key format is `engine:Name` / `renderer:Name`.
 */
const WITHHELD: Record<string, string> = {};

const collectCapabilities = (pkg: Record<string, unknown>, label: string) =>
  Object.entries(pkg)
    .filter(([name, value]) => isCapability(name, value))
    .map(([name, value]) => ({ key: `${label}:${name}`, name, value, label }));

const ENGINE_CAPS = collectCapabilities(Engine as Record<string, unknown>, 'engine');
const RENDERER_CAPS = collectCapabilities(Renderer as Record<string, unknown>, 'renderer');

describe('@grafloria/element is the front door — the lock is INVERTED', () => {
  // Sanity: if these ever collapse, the enumeration itself broke and every
  // assertion below would pass vacuously.
  it('enumerates a substantial capability surface in both lower packages', () => {
    expect(ENGINE_CAPS.length).toBeGreaterThan(150);
    expect(RENDERER_CAPS.length).toBeGreaterThan(100);
  });

  describe.each([
    ['@grafloria/engine', ENGINE_CAPS],
    ['@grafloria/renderer', RENDERER_CAPS],
  ])('every capability in %s is reachable from @grafloria/element', (_pkg, caps) => {
    it.each(caps.map((c) => [c.name, c]))('%s', (_name, cap) => {
      const withheldReason = WITHHELD[cap.key];
      if (withheldReason) {
        expect(typeof withheldReason).toBe('string');
        expect(withheldReason.length).toBeGreaterThan(20);
        return;
      }
      const exposed = (Element as Record<string, unknown>)[cap.name];
      // Identity, not presence. A same-named DIFFERENT function would satisfy
      // "is exported" while leaving the real capability unreachable — which is
      // precisely the shadowing bug the collision block in index.ts exists to
      // prevent, so the lock has to be able to see it.
      expect(exposed).toBe(cap.value);
    });
  });

  it('records a reason for every withheld capability, and withholds nothing else', () => {
    const known = new Set([...ENGINE_CAPS, ...RENDERER_CAPS].map((c) => c.key));
    for (const key of Object.keys(WITHHELD)) {
      // A stale entry means someone renamed or deleted a symbol and left the
      // excuse behind — the excuse would then silently cover a future symbol of
      // the same name.
      expect(known.has(key)).toBe(true);
    }
  });

  it('does not regress to the curated front door that started this', () => {
    // It was 3 at the very beginning, then ~369 under the allowlist. The
    // wholesale re-export puts it in the thousands; anything near the old
    // number means someone reinstated a filter.
    expect(Object.keys(Element).length).toBeGreaterThan(900);
  });

  // The capabilities the audit specifically found missing. They are covered by
  // the generated sweep above, but they are also the NAMED evidence of the bug,
  // so they get an explicit, greppable tooth that reads as documentation.
  it.each([
    'DiagramEngine',
    'DiagramModel',
    'NodeModel',
    'LinkModel',
    'PortModel',
    'Command',
    'CommandManager',
    'EventBus',
    'RoutingEngine',
    'LayoutRegistry',
    'PluginManager',
    'SelectionManager',
    'ClipboardManager',
    'AddNodeCommand',
    'MoveNodeCommand',
    'ResizeNodeCommand',
    'SetParentCommand',
    'BatchCommand',
    'SwimlaneService',
    'InteractionController',
    'KeyboardNavigationController',
    'SelectionToolsController',
    'InPlaceTextEditor',
    'ViewportController',
    'createDiagram',
    'createExtensionHost',
    'registerDiagramMigration',
    'validateSerializedDiagram',
  ])('the audit named %s as unreachable — it is reachable now', (name) => {
    expect(typeof (Element as Record<string, unknown>)[name]).toBe('function');
  });
});
