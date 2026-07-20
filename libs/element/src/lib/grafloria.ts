import { createDiagram, renderToStaticSVG } from '@grafloria/renderer';
import type {
  CreateDiagramOptions,
  DiagramInstance,
  EdgeSpec,
  NodeSpec,
  StaticRenderOptions,
  StaticRenderResult,
} from '@grafloria/renderer';
import { defineGrafloriaFlow } from './grafloria-flow-element';
import { registerNodeType, registeredNodeTypes, getNodeType } from './node-type-registry';
import type { NodeTypeRenderer } from './node-type-registry';

/**
 * `Grafloria` — the Mermaid-shaped top-level API.
 *
 * Mermaid's moat is not its renderer, it is `mermaid.render(id, text)`: one
 * function, no build step, no framework. That is why it shows up in GitHub
 * comments, in docs sites, in notebooks and in every CMS. This is the same
 * surface for a diagram that is *interactive*:
 *
 * ```html
 * <script type="module">
 *   import { Grafloria } from 'https://esm.sh/@grafloria/element';
 *
 *   Grafloria.registerNodeType('card', (node, el) => {
 *     el.innerHTML = `<div class="card">${node.data.title}</div>`;
 *   });
 *
 *   const diagram = Grafloria.render(
 *     { nodes: [...], edges: [...] },
 *     document.getElementById('chart')
 *   );
 *   diagram.on('connect', ({ link }) => save(link));
 * </script>
 * ```
 *
 * `render()` returns the same `DiagramInstance` every wrapper binds to, so the
 * "tiny API" is not a lesser one — it is the whole engine, addressed in one call.
 */

/** What `Grafloria.render()` accepts: an object spec, or the JSON string of one. */
export interface DiagramSpec {
  nodes?: NodeSpec[];
  edges?: EdgeSpec[];
}

export type RenderSpec = DiagramSpec | string;

export type RenderOptions = Omit<CreateDiagramOptions, 'nodes' | 'edges'>;

/**
 * Mount `spec` into `target` and return the live instance.
 *
 * `target` may be an element or a CSS selector. Custom nodes (`custom: true`)
 * are rendered by the types registered with {@link registerNodeType}.
 *
 * SCOPE, stated plainly: `spec` is data (an object or its JSON), not a Mermaid-
 * style text DSL. The engine does have a DSL, but wiring it in is a separate
 * card — `render()` is the embedding surface, not a parser.
 */
export function render(
  spec: RenderSpec,
  target: HTMLElement | string,
  options: RenderOptions = {}
): DiagramInstance {
  const element =
    typeof target === 'string'
      ? (document.querySelector(target) as HTMLElement | null)
      : target;

  if (!element) {
    throw new Error(`Grafloria.render: no element matched ${JSON.stringify(target)}`);
  }

  const parsed: DiagramSpec = typeof spec === 'string' ? parseSpec(spec) : spec;

  const instance = createDiagram(element, {
    ...options,
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    // Wire the global registry in, so `registerNodeType` works for the tiny API
    // exactly as it does for `<grafloria-flow>` — unless the caller supplies their
    // own. A KIT SPEC may also carry its own painter (dashboard() does: every
    // widget is a custom HTML node), and it must be honoured — otherwise the
    // documented one-liner `render(dashboard({…}), host)` mounts a board whose
    // widgets never paint. Precedence: explicit option > spec > registry.
    renderCustomNode:
      options.renderCustomNode ??
      (parsed as { renderCustomNode?: RenderOptions['renderCustomNode'] }).renderCustomNode ??
      ((node, host) => getNodeType(node.type)?.(node, host)),
  });

  // Diagram-kit specs (erDiagram/umlDiagram) carry a `finalize(api)` for the
  // post-render wiring that needs the LIVE instance — row interactions,
  // multiplicity chips. Auto-run it so a kit diagram is fully wired from one
  // render() call; finalize is idempotent, so a caller may still call it too.
  const maybeFinalize = (spec as { finalize?: (api: unknown) => void }).finalize;
  if (typeof maybeFinalize === 'function') {
    try {
      maybeFinalize(instance);
    } catch {
      /* a kit's finalize must never break the mount */
    }
  }

  return instance;
}

/** Server-side render (Card 6). Re-exported so the tiny API is self-contained. */
export function renderStatic(options: StaticRenderOptions = {}): StaticRenderResult {
  return renderToStaticSVG(options);
}

function parseSpec(spec: string): DiagramSpec {
  try {
    return JSON.parse(spec) as DiagramSpec;
  } catch (error) {
    throw new Error(
      `Grafloria.render: spec must be an object or a JSON string (${(error as Error).message})`
    );
  }
}

/** The namespace object, for `import { Grafloria }` and for `<script>` globals. */
export const Grafloria = {
  render,
  renderStatic,
  registerNodeType,
  registeredNodeTypes,
  /** Register `<grafloria-flow>` (called for you when you import this package). */
  define: defineGrafloriaFlow,
};

export type { NodeTypeRenderer };
