export * from './svg-renderer';
export * from './ArrowRenderer'; // Phase 1.1
export * from './LabelRenderer'; // Phase 1.2
export * from './JumpPointDetector'; // Phase 1.3
export * from './JumpPointRenderer'; // Phase 1.3
export * from './port-positioning'; // Phase 3.2 - Shape-aware port positioning
// Wave 6 (Ports & connections)
export * from './port-layout'; // Card 4 - pluggable port-layout strategies
export * from './port-glyph'; // Card 0 - non-circle port glyphs
export * from './port-label'; // Card 1 - port labels with layout
export * from './port-spots'; // Card 5 - attachment spots + multi-link spreading
export * from './link-hit-test'; // Wave 1 - Part-aware link hit-testing
export * from './shape-registry'; // Nodes & shapes - unified shape registry + registerShape API
export * from './path-outline'; // Wave 5 Card 2 - arbitrary SVG-path outline sampling
export * from './node-sizing'; // Wave 5 Card 6/7 - per-node sizing constraints
export * from './node-toolbar'; // Wave 5 Card 6 - per-node toolbar config seam
export * from './auto-size'; // Wave 5 Card 7 - content-aware auto-sizing
export * from './panel'; // Wave 5 Card 5 - composite / panel node model
export * from './html-node'; // Wave 5 Card 4 - HTML / foreignObject rich-content nodes
export * from './text-block'; // Node/link label engine - wrap / multi-line / ellipsis / shape-fit
export * from './link-fanout'; // Wave 4 Card 4 - parallel-link separation + self-loop routing
export * from './edge-optimizer'; // Wave 4 Card 7 - diagram-wide incremental label/jump/bundle pass
export * from './edge-templates'; // Wave 4 Card 5 - link/label templates + custom markers
export * from './route-memo'; // Wave 8 Card 6 - incremental routing: re-route only what changed
export * from './route-solver-bridge'; // Wave 8 Card 6 - the render loop driving the off-thread global solver
