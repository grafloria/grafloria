/**
 * The DIAGRAM-level metadata a Mermaid grammar writes when it parses, and reads back
 * when it generates.
 *
 * `DSL.generate()` picks the grammar by the diagram's `diagramType`, and each graph-family
 * generator reads its own keys (direction, notes, the block grid…). A host that loads text
 * INTO an existing model — the canvas's `loadText`, which reconciles nodes, edges and
 * groups so listeners stay attached — must carry these across too. It did not, so an
 * erDiagram, stateDiagram, block-beta or architecture-beta loaded on the canvas exported
 * as a flowchart, and a classDiagram lost its members.
 *
 * A new grammar that stores a diagram-level key adds it HERE, next to its parser.
 */
import type { DiagramModel } from '../../models/DiagramModel';

export const TEXT_GRAMMAR_METADATA_KEYS: readonly string[] = [
  'diagramType', // every graph-family parser — the generator routes on it
  'direction', // er / class / state / architecture
  'erSpec', // erDiagram → the diagram kit's erDiagram() options
  'umlSpec', // classDiagram → the kit's umlDiagram() options
  'umlNotes', // classDiagram notes
  'stateNotes', // stateDiagram notes
  'grid', // block-beta columns and cells
  'blockStyleLines', // block-beta pass-through directives
  'layout', // block-beta / architecture-beta: laid out as an architecture
  'layoutCompact', // block-beta
];

/**
 * Make `target` carry `source`'s grammar metadata: copy every key `source` has, and
 * DELETE every key it lacks — a flowchart loaded after an erDiagram must not keep the
 * stale `diagramType` and export as ER.
 */
export function adoptTextGrammarMetadata(target: DiagramModel, source: DiagramModel): void {
  for (const key of TEXT_GRAMMAR_METADATA_KEYS) {
    const value = source.getMetadata(key);
    if (value === undefined) {
      if (target.getMetadata(key) !== undefined) target.deleteMetadata(key);
    } else {
      target.setMetadata(key, value);
    }
  }
}
