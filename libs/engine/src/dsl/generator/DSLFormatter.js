/**
 * DSL Formatter - Formats DSL text for readability
 *
 * Provides clean, consistent formatting for generated DSL text:
 * - Proper indentation
 * - Line wrapping
 * - Comment alignment
 * - Whitespace normalization
 */
export class DSLFormatter {
    constructor(options = {}) {
        var _a, _b, _c;
        this.options = {
            indent: options.indent || '  ',
            maxLineLength: options.maxLineLength || 100,
            preserveBlankLines: (_a = options.preserveBlankLines) !== null && _a !== void 0 ? _a : true,
            blankLineBeforeComments: (_b = options.blankLineBeforeComments) !== null && _b !== void 0 ? _b : false,
            alignComments: (_c = options.alignComments) !== null && _c !== void 0 ? _c : false,
        };
    }
    /**
     * Format DSL text
     */
    format(text) {
        const lines = text.split('\n');
        const formatted = [];
        let inSubgraph = false;
        let indentLevel = 0;
        let previousLineWasBlank = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // Skip empty lines (but preserve them if option is set)
            if (trimmed === '') {
                if (this.options.preserveBlankLines && !previousLineWasBlank) {
                    formatted.push('');
                    previousLineWasBlank = true;
                }
                continue;
            }
            previousLineWasBlank = false;
            // Handle comments
            if (trimmed.startsWith('%%')) {
                if (this.options.blankLineBeforeComments && formatted.length > 0 && formatted[formatted.length - 1] !== '') {
                    formatted.push('');
                }
                formatted.push(this.formatComment(trimmed));
                continue;
            }
            // Handle diagram declaration
            if (this.isDiagramDeclaration(trimmed)) {
                formatted.push(trimmed);
                continue;
            }
            // Handle subgraph start
            if (trimmed.startsWith('subgraph')) {
                formatted.push(this.indent(trimmed, indentLevel));
                inSubgraph = true;
                indentLevel++;
                continue;
            }
            // Handle subgraph end
            if (trimmed === 'end' && inSubgraph) {
                indentLevel--;
                formatted.push(this.indent(trimmed, indentLevel));
                inSubgraph = false;
                continue;
            }
            // Handle regular statements
            const formattedLine = this.formatStatement(trimmed, indentLevel);
            formatted.push(formattedLine);
        }
        return formatted.join('\n');
    }
    /**
     * Format a comment line
     */
    formatComment(comment) {
        // Ensure single space after %%
        if (comment.startsWith('%%')) {
            const content = comment.substring(2).trim();
            if (content) {
                return `%% ${content}`;
            }
            return '%%';
        }
        return comment;
    }
    /**
     * Format a statement line
     */
    formatStatement(statement, indentLevel) {
        // Normalize whitespace around arrows and operators
        let formatted = statement;
        // Normalize arrows
        formatted = formatted.replace(/\s*-->\s*/g, ' --> ');
        formatted = formatted.replace(/\s*---\s*/g, ' --- ');
        formatted = formatted.replace(/\s*-\.->\s*/g, ' -.-> ');
        formatted = formatted.replace(/\s*-\.-\s*/g, ' -.- ');
        formatted = formatted.replace(/\s*==>\s*/g, ' ==> ');
        formatted = formatted.replace(/\s*===\s*/g, ' === ');
        formatted = formatted.replace(/\s*<-->\s*/g, ' <--> ');
        // Normalize style syntax
        formatted = formatted.replace(/\s*:\s*/g, ':');
        formatted = formatted.replace(/\s*,\s*/g, ',');
        // Apply indentation
        return this.indent(formatted, indentLevel);
    }
    /**
     * Apply indentation
     */
    indent(text, level) {
        if (level === 0)
            return text;
        return this.options.indent.repeat(level) + text;
    }
    /**
     * Check if line is a diagram declaration
     */
    isDiagramDeclaration(line) {
        return (line.startsWith('flowchart') ||
            line.startsWith('graph') ||
            line.startsWith('erDiagram') ||
            line.startsWith('classDiagram') ||
            line.startsWith('stateDiagram') ||
            line.startsWith('sequenceDiagram'));
    }
    /**
     * Wrap long lines
     */
    wrapLongLines(text) {
        const lines = text.split('\n');
        const wrapped = [];
        for (const line of lines) {
            if (line.length <= this.options.maxLineLength) {
                wrapped.push(line);
                continue;
            }
            // Don't wrap comments or declarations
            const trimmed = line.trim();
            if (trimmed.startsWith('%%') || this.isDiagramDeclaration(trimmed)) {
                wrapped.push(line);
                continue;
            }
            // Try to wrap at arrow
            const arrowMatch = line.match(/^(\s*\S+\s+(?:-->|--->|===>|\.\.>|---)\s*)/);
            if (arrowMatch) {
                const prefix = arrowMatch[1];
                const rest = line.substring(prefix.length);
                wrapped.push(prefix);
                wrapped.push(this.indent(rest, 1));
            }
            else {
                wrapped.push(line);
            }
        }
        return wrapped.join('\n');
    }
    /**
     * Normalize whitespace
     */
    normalizeWhitespace(text) {
        return text
            .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .trim();
    }
    /**
     * Remove comments
     */
    removeComments(text) {
        return text
            .split('\n')
            .filter(line => !line.trim().startsWith('%%'))
            .join('\n');
    }
    /**
     * Add section headers
     */
    addSectionHeaders(text) {
        const lines = text.split('\n');
        const result = [];
        let inNodes = false;
        let inEdges = false;
        let inStyles = false;
        for (const line of lines) {
            const trimmed = line.trim();
            // Diagram declaration
            if (this.isDiagramDeclaration(trimmed)) {
                result.push(line);
                continue;
            }
            // Node definition
            if (this.isNodeDefinition(trimmed) && !inNodes && !inEdges) {
                result.push('');
                result.push('%% Nodes');
                inNodes = true;
            }
            // Edge definition
            if (this.isEdgeDefinition(trimmed) && !inEdges) {
                if (inNodes) {
                    result.push('');
                    result.push('%% Edges');
                    inNodes = false;
                    inEdges = true;
                }
            }
            // Style definition
            if (trimmed.startsWith('style ') && !inStyles) {
                if (inNodes || inEdges) {
                    result.push('');
                    result.push('%% Styles');
                    inNodes = false;
                    inEdges = false;
                    inStyles = true;
                }
            }
            result.push(line);
        }
        return result.join('\n');
    }
    /**
     * Check if line is a node definition
     */
    isNodeDefinition(line) {
        // Simple heuristic: contains brackets but no arrow
        return /[\[\(\{\<].*[\]\)\}\>]/.test(line) && !this.isEdgeDefinition(line);
    }
    /**
     * Check if line is an edge definition
     */
    isEdgeDefinition(line) {
        return /(?:-->|---|\.\.>|==>|<-->)/.test(line);
    }
    /**
     * Pretty print with all formatting options
     */
    prettyPrint(text, addHeaders = false) {
        let formatted = this.format(text);
        formatted = this.normalizeWhitespace(formatted);
        if (addHeaders) {
            formatted = this.addSectionHeaders(formatted);
        }
        return formatted;
    }
    /**
     * Minify (remove all formatting)
     */
    minify(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('%%'))
            .join('\n');
    }
}
//# sourceMappingURL=DSLFormatter.js.map