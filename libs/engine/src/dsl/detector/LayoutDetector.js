/**
 * Layout Detector - Intelligently selects layout presets based on diagram characteristics
 *
 * Analyzes the diagram structure, AST metadata, and connection patterns
 * to automatically select the most appropriate layout algorithm.
 */
export class LayoutDetector {
    /**
     * Detect optimal layout for a diagram
     */
    detect(diagram, ast) {
        const characteristics = this.analyzeCharacteristics(diagram, ast);
        // Use diagram type and direction hints if available
        if (ast === null || ast === void 0 ? void 0 : ast.diagramType) {
            return this.detectFromDiagramType(ast.diagramType, characteristics, ast.direction);
        }
        // Fallback to structural analysis
        return this.detectFromStructure(characteristics);
    }
    /**
     * Detect layout based on diagram type
     */
    detectFromDiagramType(diagramType, characteristics, direction) {
        switch (diagramType) {
            case 'flowchart':
                return this.detectFlowchartLayout(characteristics, direction);
            case 'bpmn':
                return this.detectBPMNLayout(characteristics, direction);
            case 'erd':
                return this.detectERDLayout(characteristics);
            case 'classDiagram':
                return this.detectClassDiagramLayout(characteristics);
            default:
                return this.detectFromStructure(characteristics);
        }
    }
    /**
     * Detect layout for flowcharts
     */
    detectFlowchartLayout(characteristics, direction) {
        // Flowcharts typically use hierarchical or sequential layouts
        if (characteristics.isTree) {
            // Tree-like flowchart
            if (direction === 'LR' || direction === 'RL') {
                return {
                    presetId: 'tree-left-to-right',
                    confidence: 0.9,
                    reasoning: 'Tree-structured flowchart with horizontal direction hint',
                    alternatives: ['workflow-horizontal', 'data-flow'],
                };
            }
            else {
                return {
                    presetId: 'tree-top-to-bottom',
                    confidence: 0.9,
                    reasoning: 'Tree-structured flowchart with vertical direction',
                    alternatives: ['workflow-vertical', 'org-chart-compact'],
                };
            }
        }
        if (characteristics.isDAG) {
            // DAG flowchart - use workflow layouts
            if (direction === 'LR' || direction === 'RL') {
                return {
                    presetId: 'workflow-horizontal',
                    confidence: 0.85,
                    reasoning: 'Sequential flowchart with left-to-right flow',
                    alternatives: ['data-flow', 'state-machine'],
                };
            }
            else {
                return {
                    presetId: 'workflow-vertical',
                    confidence: 0.85,
                    reasoning: 'Sequential flowchart with top-to-bottom flow',
                    alternatives: ['org-chart-spacious', 'component-diagram'],
                };
            }
        }
        // Cyclic flowchart
        if (characteristics.hasCycles) {
            return {
                presetId: 'state-machine',
                confidence: 0.8,
                reasoning: 'Flowchart with cycles, likely a state machine or feedback loop',
                alternatives: ['force-directed-balanced', 'workflow-horizontal'],
            };
        }
        // Default horizontal workflow
        return {
            presetId: 'workflow-horizontal',
            confidence: 0.75,
            reasoning: 'General flowchart with horizontal layout',
            alternatives: ['workflow-vertical', 'tree-left-to-right'],
        };
    }
    /**
     * Detect layout for BPMN diagrams
     */
    detectBPMNLayout(characteristics, direction) {
        // BPMN typically uses horizontal workflows
        if (direction === 'TB' || direction === 'BT') {
            return {
                presetId: 'workflow-vertical',
                confidence: 0.85,
                reasoning: 'BPMN process with vertical flow',
                alternatives: ['component-diagram'],
            };
        }
        return {
            presetId: 'workflow-horizontal',
            confidence: 0.9,
            reasoning: 'BPMN process with standard left-to-right flow',
            alternatives: ['data-flow', 'state-machine'],
        };
    }
    /**
     * Detect layout for ERD diagrams
     */
    detectERDLayout(characteristics) {
        // ERD diagrams typically use force-directed or layered layouts
        if (characteristics.nodeCount > 20) {
            return {
                presetId: 'force-directed-tight',
                confidence: 0.8,
                reasoning: 'Large ERD with many entities - compact force-directed layout',
                alternatives: ['stress-minimization', 'force-directed-balanced'],
            };
        }
        if (characteristics.nodeCount > 10) {
            return {
                presetId: 'force-directed-balanced',
                confidence: 0.85,
                reasoning: 'Medium ERD with balanced force-directed layout',
                alternatives: ['stress-minimization', 'radial-center'],
            };
        }
        return {
            presetId: 'radial-center',
            confidence: 0.8,
            reasoning: 'Small ERD with radial layout around central entities',
            alternatives: ['force-directed-balanced'],
        };
    }
    /**
     * Detect layout for class diagrams
     */
    detectClassDiagramLayout(characteristics) {
        // Class diagrams often have inheritance hierarchies
        if (characteristics.isTree || characteristics.maxDepth > 3) {
            return {
                presetId: 'tree-top-to-bottom',
                confidence: 0.85,
                reasoning: 'Class diagram with inheritance hierarchy',
                alternatives: ['org-chart-spacious', 'component-diagram'],
            };
        }
        return {
            presetId: 'component-diagram',
            confidence: 0.8,
            reasoning: 'Class diagram with component-based layout',
            alternatives: ['force-directed-balanced', 'microservices-layered'],
        };
    }
    /**
     * Detect layout from structure (fallback)
     */
    detectFromStructure(characteristics) {
        // Hierarchical structures
        if (characteristics.isTree) {
            return {
                presetId: 'tree-top-to-bottom',
                confidence: 0.8,
                reasoning: 'Tree structure detected',
                alternatives: ['org-chart-compact', 'tree-left-to-right'],
            };
        }
        // DAG structures
        if (characteristics.isDAG) {
            if (characteristics.maxDepth > 4) {
                return {
                    presetId: 'workflow-vertical',
                    confidence: 0.75,
                    reasoning: 'Deep DAG structure - vertical layout',
                    alternatives: ['component-diagram', 'org-chart-spacious'],
                };
            }
            else {
                return {
                    presetId: 'workflow-horizontal',
                    confidence: 0.75,
                    reasoning: 'Shallow DAG structure - horizontal workflow',
                    alternatives: ['data-flow', 'microservices-layered'],
                };
            }
        }
        // Dense networks
        if (characteristics.averageDegree > 4) {
            return {
                presetId: 'force-directed-tight',
                confidence: 0.7,
                reasoning: 'Dense network with many connections',
                alternatives: ['stress-minimization', 'force-directed-balanced'],
            };
        }
        // Sparse networks
        if (characteristics.averageDegree < 2) {
            return {
                presetId: 'force-directed-balanced',
                confidence: 0.7,
                reasoning: 'Sparse network with few connections',
                alternatives: ['radial-center', 'tree-top-to-bottom'],
            };
        }
        // Default: force-directed for general graphs
        return {
            presetId: 'force-directed-balanced',
            confidence: 0.65,
            reasoning: 'General graph structure',
            alternatives: ['stress-minimization', 'workflow-horizontal'],
        };
    }
    /**
     * Analyze diagram characteristics
     */
    analyzeCharacteristics(diagram, ast) {
        var _a, _b;
        const nodes = diagram.getNodes();
        const links = diagram.getLinks();
        const nodeCount = nodes.length;
        const linkCount = links.length;
        // Build adjacency lists
        const outgoing = new Map();
        const incoming = new Map();
        for (const node of nodes) {
            outgoing.set(node.id, new Set());
            incoming.set(node.id, new Set());
        }
        for (const link of links) {
            const sourceNode = diagram.getNode(link.sourceNodeId || '');
            const targetNode = diagram.getNode(link.targetNodeId || '');
            if (sourceNode && targetNode) {
                (_a = outgoing.get(sourceNode.id)) === null || _a === void 0 ? void 0 : _a.add(targetNode.id);
                (_b = incoming.get(targetNode.id)) === null || _b === void 0 ? void 0 : _b.add(sourceNode.id);
            }
        }
        // Calculate degrees
        const degrees = nodes.map((node) => { var _a, _b; return (((_a = outgoing.get(node.id)) === null || _a === void 0 ? void 0 : _a.size) || 0) + (((_b = incoming.get(node.id)) === null || _b === void 0 ? void 0 : _b.size) || 0); });
        const averageDegree = degrees.reduce((a, b) => a + b, 0) / (nodeCount || 1);
        const maxDegree = Math.max(...degrees, 0);
        // Detect cycles using DFS
        const hasCycles = this.detectCycles(nodes, outgoing);
        // Calculate max depth (for trees/DAGs)
        const maxDepth = this.calculateMaxDepth(nodes, outgoing, incoming);
        // Check if tree
        const isTree = !hasCycles && linkCount === nodeCount - 1;
        // Check if DAG
        const isDAG = !hasCycles;
        return {
            nodeCount,
            linkCount,
            hasCycles,
            maxDepth,
            averageDegree,
            maxDegree,
            isTree,
            isDAG,
            direction: ast === null || ast === void 0 ? void 0 : ast.direction,
            diagramType: ast === null || ast === void 0 ? void 0 : ast.diagramType,
        };
    }
    /**
     * Detect cycles using DFS
     */
    detectCycles(nodes, outgoing) {
        const visited = new Set();
        const recursionStack = new Set();
        const dfs = (nodeId) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            const neighbors = outgoing.get(nodeId);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        if (dfs(neighbor))
                            return true;
                    }
                    else if (recursionStack.has(neighbor)) {
                        return true; // Cycle detected
                    }
                }
            }
            recursionStack.delete(nodeId);
            return false;
        };
        for (const node of nodes) {
            if (!visited.has(node.id)) {
                if (dfs(node.id))
                    return true;
            }
        }
        return false;
    }
    /**
     * Calculate maximum depth of the graph
     */
    calculateMaxDepth(nodes, outgoing, incoming) {
        // Find root nodes (no incoming edges)
        const roots = nodes.filter((node) => { var _a; return (((_a = incoming.get(node.id)) === null || _a === void 0 ? void 0 : _a.size) || 0) === 0; });
        if (roots.length === 0) {
            return 0; // No roots, likely cyclic
        }
        let maxDepth = 0;
        const dfs = (nodeId, depth) => {
            maxDepth = Math.max(maxDepth, depth);
            const neighbors = outgoing.get(nodeId);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    dfs(neighbor, depth + 1);
                }
            }
        };
        for (const root of roots) {
            dfs(root.id, 1);
        }
        return maxDepth;
    }
}
//# sourceMappingURL=LayoutDetector.js.map