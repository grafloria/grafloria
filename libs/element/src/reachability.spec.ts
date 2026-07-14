/**
 * THE REACHABILITY LOCK.
 *
 * Wave 10 built the demo gallery and immediately hit a wall: not one demo for
 * styling, collaboration or export could be written, because `@grafloria/element` —
 * the package an embedder actually installs — re-exported exactly THREE runtime
 * values: `renderToStaticSVG`, `LIGHT_THEME`, `DARK_THEME`.
 *
 * Everything else was built, unit-tested, green, exported from `@grafloria/renderer`
 * or `@grafloria/engine` — and then filtered out one layer later at the package
 * boundary. PNG/SVG/PDF export. The round-trip artifact. The Mermaid text
 * format. The minimap. The perf HUD. The quality governor. The named-style
 * registry (whose cascade layer ran on EVERY FRAME reading a registry nothing
 * could write to). The WCAG maths. `deriveTheme()`. `themeRef()`. The token
 * bridges. Cross-tab sync. The CRDT. Presence. Comments. Presentation mode.
 *
 * That is this repository's signature bug — machinery wired to nothing — and it
 * had reached the last mile: the front door.
 *
 * This spec is the lock. It asserts each capability is REACHABLE (exported, of
 * the right kind) from the public package. It deliberately does not test what
 * the functions DO — their own suites do that, and did, the whole time they were
 * unreachable. That is exactly the point: a unit test proves a unit works; it
 * never proves anything CALLS it.
 */
import * as Element from './index';

/** Names an embedder must be able to import to drive the advertised feature. */
const REQUIRED: Record<string, readonly string[]> = {
  'the embed itself': ['render', 'renderStatic', 'Grafloria', 'defineGrafloriaFlow', 'registerNodeType'],

  'theming: OS colour-mode + high contrast': [
    'ColorModeController',
    'resolveThemeFromPrefs',
    'readColorPreferences',
    'DEFAULT_THEME_SET',
    'HIGH_CONTRAST_LIGHT_THEME',
    'HIGH_CONTRAST_DARK_THEME',
  ],
  'theming: theme-bound properties': ['themeRef', 'isThemeRef', 'resolveThemeRef'],
  'theming: WCAG maths + self-auditing derivation': [
    'contrastRatio',
    'meetsContrast',
    'ensureContrast',
    'auditThemeContrast',
    'assertThemeContrast',
    'deriveTheme',
    'WCAG',
  ],
  'theming: design-token bridge': ['shadcnBridge', 'muiBridge', 'tailwindBridge'],
  'theming: named style classes': ['defineStyle', 'listStyles', 'clearStyles', 'CASCADE_ORDER'],
  'theming: instance-scoped CSS variables': [
    'THEME_VARS',
    'themeVar',
    'resolveThemeVars',
    'GRAFLORIA_INSTANCE_ATTR',
  ],

  'export: SVG / PDF / raster': [
    'exportSvg',
    'serializeVNode',
    'exportPdf',
    'vnodeBounds',
    'resolveRasterBackend',
  ],
  'export: the model rides inside the artifact': [
    'embedModelInSvg',
    'extractModelFromSvg',
    'embedModelInPng',
    'extractModelFromPng',
    'isEditableArtifact',
    'importDiagram',
  ],
  'export: lossless Mermaid text + hand-edit detection': [
    'exportDiagramText',
    'importDiagramText',
    'stripGrafloriaSidecar',
  ],

  'canvas furniture (and the three flags it makes live)': [
    'attachCanvasPlugins',
    'createMiniMap',
    'createControls',
    'createBackground',
  ],
  'performance: governor + HUD': ['QualityGovernor', 'PerfHud', 'formatSnapshot'],

  'collab: transport + session (server-optional)': [
    'createSyncSession',
    'MemoryHub',
    'BroadcastChannelTransport',
    'WebSocketTransport',
    'UnreliableHub',
  ],
  'collab: the per-property CRDT': ['Replica', 'LwwRegistry', 'applyOp', 'OpLog'],
  'collab: presence layer': ['bindPresence', 'PresenceOverlay', 'actorColor'],
  'collab: threaded comments': ['CommentStore', 'CommentOverlayController'],
  'collab: presentation / follow-the-presenter': [
    'InMemoryViewportChannel',
    'presentTo',
    'followPresenter',
    'lockDocument',
    'loadReadonlySnapshot',
  ],
};

describe('@grafloria/element is the front door — every advertised feature must fit through it', () => {
  for (const [capability, names] of Object.entries(REQUIRED)) {
    describe(capability, () => {
      it.each(names)('exports %s', (name) => {
        const value = (Element as Record<string, unknown>)[name];
        expect(value).toBeDefined();
        // `undefined` would also be "defined" if someone exported a type by
        // mistake and the transpiler erased it — so pin the KIND too. Every name
        // here is a function, a class, or a frozen constant object/array/string.
        expect(['function', 'object', 'string']).toContain(typeof value);
      });
    });
  }

  it('does not regress to the three-export front door that started this', () => {
    const runtimeExports = Object.keys(Element);
    // It was 15 (counting the element + node-type registry). Anything near that
    // means someone has pruned the surface back and broken the embed again.
    expect(runtimeExports.length).toBeGreaterThan(100);
  });
});
