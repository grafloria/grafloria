/**
 * DSL Generator - Converts DiagramModel to DSL text
 *
 * Generates Mermaid-compatible diagram syntax from DiagramModel instances.
 * Supports flowcharts, BPMN, ERD, and class diagrams.
 */
import { DiagramAnalyzer } from './DiagramAnalyzer';
export class DSLGenerator {
    constructor() {
        this.analyzer = new DiagramAnalyzer();
    }
    /**
     * Generate DSL text from diagram
     */
    generate(diagram, options = {}) {
        const { includeComments = true, includeStyles = true, preserveIds = true, includeSubgraphs = false, } = options;
        // Analyze diagram structure
        this.analysis = this.analyzer.analyze(diagram);
        const lines = [];
        // Add header comment
        if (includeComments) {
            lines.push('%% Generated from DiagramModel');
            lines.push(`%% Nodes: ${this.analysis.stats.nodeCount}, Links: ${this.analysis.stats.linkCount}`);
            lines.push('');
        }
        // Add diagram declaration
        const diagramDeclaration = this.generateDiagramDeclaration();
        lines.push(diagramDeclaration);
        lines.push('');
        // Generate nodes and edges
        const statements = this.generateStatements(diagram, preserveIds, includeSubgraphs);
        lines.push(...statements);
        // Generate style definitions
        if (includeStyles) {
            const styles = this.generateStyles(diagram);
            if (styles.length > 0) {
                lines.push('');
                if (includeComments) {
                    lines.push('%% Styles');
                }
                lines.push(...styles);
            }
        }
        // Tier-2 %%grafloria: directives (node status, edge animation).
        const grafloria = this.generateGrafloriaDirectives(diagram);
        if (grafloria.length > 0) {
            lines.push('');
            lines.push(...grafloria);
        }
        return lines.join('\n');
    }
    /**
     * Generate diagram declaration (e.g., "flowchart TD")
     */
    generateDiagramDeclaration() {
        if (!this.analysis) {
            return 'flowchart TD';
        }
        const { diagramType, direction } = this.analysis;
        if (diagramType === 'flowchart') {
            return `flowchart ${direction}`;
        }
        else if (diagramType === 'bpmn') {
            return `flowchart ${direction} %% BPMN`;
        }
        else if (diagramType === 'erd') {
            return 'erDiagram';
        }
        else if (diagramType === 'classDiagram') {
            return 'classDiagram';
        }
        return 'flowchart TD';
    }
    /**
     * Generate statements (nodes and edges)
     */
    generateStatements(diagram, preserveIds, includeSubgraphs) {
        const lines = [];
        if (!this.analysis) {
            return lines;
        }
        const nodes = diagram.getNodes();
        const links = diagram.getLinks();
        // Generate in optimal order
        const processedNodes = new Set();
        const processedLinks = new Set();
        for (const nodeId of this.analysis.nodeOrder) {
            const node = nodes.find(n => n.id === nodeId);
            if (!node)
                continue;
            // Generate node definition
            const nodeDef = this.generateNodeDefinition(node, preserveIds);
            if (nodeDef) {
                lines.push(`  ${nodeDef}`);
                processedNodes.add(nodeId);
            }
            // Generate outgoing edges
            const outgoingLinks = links.filter(l => l.sourceNodeId === nodeId && !processedLinks.has(l.id));
            for (const link of outgoingLinks) {
                const edgeDef = this.generateEdgeDefinition(link, diagram, preserveIds);
                if (edgeDef) {
                    lines.push(`  ${edgeDef}`);
                    processedLinks.add(link.id);
                }
            }
        }
        // Generate any remaining nodes
        for (const node of nodes) {
            if (!processedNodes.has(node.id)) {
                const nodeDef = this.generateNodeDefinition(node, preserveIds);
                if (nodeDef) {
                    lines.push(`  ${nodeDef}`);
                    processedNodes.add(node.id);
                }
            }
        }
        // Generate any remaining links
        for (const link of links) {
            if (!processedLinks.has(link.id)) {
                const edgeDef = this.generateEdgeDefinition(link, diagram, preserveIds);
                if (edgeDef) {
                    lines.push(`  ${edgeDef}`);
                    processedLinks.add(link.id);
                }
            }
        }
        return lines;
    }
    /**
     * Generate node definition
     */
    generateNodeDefinition(node, preserveIds) {
        var _a, _b;
        const nodeId = preserveIds ? this.sanitizeId(node.id) : this.generateShortId(node);
        // getLabel() is the canonical read: metadata.label (editor/spec/command
        // diagrams) with a legacy data.label fallback. Reading only data.label
        // exported Mermaid bodies of raw ids — nothing human-readable to edit.
        const label = (_a = node.getLabel()) !== null && _a !== void 0 ? _a : node.id;
        // Get shape from metadata
        const shapeMetadata = (_b = this.analysis) === null || _b === void 0 ? void 0 : _b.nodeMetadata.get(node.id);
        const shape = (shapeMetadata === null || shapeMetadata === void 0 ? void 0 : shapeMetadata.shape) || 'rectangle';
        // Generate shape brackets
        const { opening, closing } = this.getShapeBrackets(shape);
        return `${nodeId}${opening}${this.escapeLabel(label, closing)}${closing}`;
    }
    /**
     * Quote a label whose content would break the surrounding syntax — brackets,
     * quotes, pipes, or the shape's own closing delimiter. Mermaid's quoted form:
     * the label is wrapped in double quotes and inner quotes travel as #quot;.
     * Plain labels pass through untouched, so existing bodies do not churn.
     */
    escapeLabel(label, closing) {
        const needsQuoting = /[[\](){}"|]/.test(label) ||
            label !== label.trim() ||
            (closing.length > 0 && label.includes(closing));
        if (!needsQuoting)
            return label;
        return `"${label.replace(/"/g, '#quot;')}"`;
    }
    /**
     * Generate edge definition
     */
    generateEdgeDefinition(link, diagram, preserveIds) {
        const sourceNode = diagram.getNode(link.sourceNodeId || '');
        const targetNode = diagram.getNode(link.targetNodeId || '');
        if (!sourceNode || !targetNode) {
            return null;
        }
        const sourceId = preserveIds ? this.sanitizeId(sourceNode.id) : this.generateShortId(sourceNode);
        const targetId = preserveIds ? this.sanitizeId(targetNode.id) : this.generateShortId(targetNode);
        // Get link type from metadata or infer from style
        const linkType = this.inferLinkType(link);
        const linkSyntax = this.getLinkSyntax(linkType);
        // Add label if present (canonical read; see generateNodeDefinition)
        const label = link.getLabel();
        if (label) {
            return `${sourceId} ${linkSyntax.split('>')[0]}>|${label}|${linkSyntax.split('>')[1] || ''} ${targetId}`;
        }
        return `${sourceId} ${linkSyntax} ${targetId}`;
    }
    /**
     * Generate style definitions
     */
    generateStyles(diagram) {
        const lines = [];
        if (!this.analysis) {
            return lines;
        }
        const nodes = diagram.getNodes();
        for (const node of nodes) {
            // Emit for nodes the DSL transformer actually styled — not the analyzer's
            // hasCustomStyle flag, which treats fill/stroke as non-custom.
            if (node.getMetadata('dslStyled') && node.style) {
                const styleProps = this.formatStyleProperties(node.style);
                if (styleProps) {
                    lines.push(`  style ${this.sanitizeId(node.id)} ${styleProps}`);
                }
            }
        }
        return lines;
    }
    /**
     * Tier-2 extension directives (%%grafloria:node status / %%grafloria:edge animation)
     * — Grafloria-only features carried in comments a Mermaid renderer ignores, so
     * the visible body stays valid Mermaid. Always emitted (they are data, not
     * decorative comments gated by includeComments).
     */
    generateGrafloriaDirectives(diagram) {
        var _a, _b;
        const lines = [];
        for (const node of diagram.getNodes()) {
            const status = (_a = node.state) === null || _a === void 0 ? void 0 : _a.status;
            if (status && status !== 'idle') {
                lines.push(`%%grafloria:node ${this.sanitizeId(node.id)} status:${status}`);
            }
        }
        for (const link of diagram.getLinks()) {
            const anim = (_b = link.style) === null || _b === void 0 ? void 0 : _b.animation;
            if ((anim === null || anim === void 0 ? void 0 : anim.type) && anim.type !== 'none') {
                let line = `%%grafloria:edge ${link.sourceNodeId} ${link.targetNodeId} animation:${anim.type}`;
                if (anim.speed)
                    line += `,speed:${anim.speed}`;
                lines.push(line);
            }
        }
        return lines;
    }
    /**
     * Format style properties
     */
    formatStyleProperties(style) {
        const props = [];
        if (style.fill) {
            props.push(`fill:${style.fill}`);
        }
        if (style.stroke) {
            props.push(`stroke:${style.stroke}`);
        }
        if (style.strokeWidth) {
            props.push(`stroke-width:${style.strokeWidth}`);
        }
        if (style.strokeDasharray) {
            props.push(`stroke-dasharray:${style.strokeDasharray}`);
        }
        if (style.color) {
            props.push(`color:${style.color}`);
        }
        return props.join(',');
    }
    /**
     * Get shape brackets for node definition
     */
    getShapeBrackets(shape) {
        const brackets = {
            'rectangle': { opening: '[', closing: ']' },
            'rounded-rectangle': { opening: '(', closing: ')' },
            'stadium': { opening: '([', closing: '])' },
            'subroutine': { opening: '[[', closing: ']]' },
            'cylindrical': { opening: '[(', closing: ')]' },
            'circle': { opening: '((', closing: '))' },
            'asymmetric': { opening: '>', closing: ']' },
            'rhombus': { opening: '{', closing: '}' },
            'hexagon': { opening: '{{', closing: '}}' },
            'trapezoid': { opening: '[/', closing: '/]' },
            'trapezoid-alt': { opening: '[\\', closing: '\\]' },
        };
        return brackets[shape] || brackets['rectangle'];
    }
    /**
     * Infer link type from link metadata and style
     */
    inferLinkType(link) {
        var _a, _b;
        // Check metadata first
        const dslLinkType = link.getMetadata('dslLinkType');
        if (dslLinkType) {
            return dslLinkType;
        }
        // Infer from style
        if ((_a = link.style) === null || _a === void 0 ? void 0 : _a.strokeDasharray) {
            return 'dotted-arrow';
        }
        if (((_b = link.style) === null || _b === void 0 ? void 0 : _b.strokeWidth) && link.style.strokeWidth > 3) {
            return 'thick-arrow';
        }
        return 'arrow';
    }
    /**
     * Get link syntax for link type
     */
    getLinkSyntax(linkType) {
        const syntax = {
            'arrow': '-->',
            'line': '---',
            'dotted-arrow': '-.->',
            'dotted-line': '-.-',
            'thick-arrow': '==>',
            'thick-line': '===',
            'bidirectional': '<-->',
            'circle-edge': '--o',
            'cross-edge': '--x',
        };
        return syntax[linkType] || '-->';
    }
    /**
     * Sanitize node ID for DSL output
     */
    sanitizeId(id) {
        // Remove special characters and replace with underscore
        return id.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    /**
     * Generate short ID for node
     */
    generateShortId(node) {
        var _a;
        // Use first letter of label if available (canonical read)
        const label = (_a = node.getLabel()) !== null && _a !== void 0 ? _a : node.id;
        const firstLetter = label.charAt(0).toUpperCase();
        // Add counter if needed (implementation detail)
        return firstLetter;
    }
}
//# sourceMappingURL=DSLGenerator.js.map