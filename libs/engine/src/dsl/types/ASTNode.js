/**
 * Abstract Syntax Tree (AST) Node Definitions
 *
 * Represents the parsed structure of diagram DSL code
 */
/**
 * Type guard helpers
 */
export function isNodeDefinition(node) {
    return node.type === 'NodeDefinition';
}
export function isEdgeDefinition(node) {
    return node.type === 'EdgeDefinition';
}
export function isSubgraph(node) {
    return node.type === 'Subgraph';
}
export function isStyleNode(node) {
    return node.type === 'Style';
}
export function isClassDef(node) {
    return node.type === 'ClassDef';
}
//# sourceMappingURL=ASTNode.js.map