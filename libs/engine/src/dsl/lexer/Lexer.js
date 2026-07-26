/**
 * DSL Lexer - Tokenizes Mermaid-compatible diagram syntax
 *
 * Converts text input into a stream of tokens for the parser
 */
import { TokenType, createToken } from '../types/Token';
export class Lexer {
    constructor(input) {
        this.position = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        this.input = input;
    }
    /**
     * Tokenize the entire input
     */
    tokenize() {
        this.tokens = [];
        this.position = 0;
        this.line = 1;
        this.column = 1;
        while (!this.isAtEnd()) {
            this.scanToken();
        }
        // Add EOF token
        this.addToken(TokenType.EOF, '', this.position, this.position);
        return this.tokens;
    }
    /**
     * Scan a single token
     */
    scanToken() {
        const start = this.position;
        const startColumn = this.column;
        const char = this.advance();
        switch (char) {
            case '\n':
                this.addToken(TokenType.NEWLINE, char, start, this.position);
                this.line++;
                this.column = 1;
                break;
            case ' ':
            case '\t':
            case '\r':
                // Skip whitespace (don't create tokens)
                break;
            case '%':
                // Comment: %% comment text
                if (this.peek() === '%') {
                    this.scanComment(start);
                }
                else {
                    this.addToken(TokenType.UNKNOWN, char, start, this.position);
                }
                break;
            case ':':
                if (this.peek() === ':' && this.peekNext() === ':') {
                    this.advance();
                    this.advance();
                    this.addToken(TokenType.TRIPLE_COLON, ':::', start, this.position);
                }
                else {
                    this.addToken(TokenType.COLON, char, start, this.position);
                }
                break;
            case ';':
                this.addToken(TokenType.SEMICOLON, char, start, this.position);
                break;
            case ',':
                this.addToken(TokenType.COMMA, char, start, this.position);
                break;
            case '|':
                this.addToken(TokenType.PIPE, char, start, this.position);
                break;
            case '&':
                this.addToken(TokenType.AMPERSAND, char, start, this.position);
                break;
            case '#':
                // Hex colour (#f9f, #ff0000, #333) — style/classDef values. Emitted as
                // an IDENTIFIER carrying the leading '#' so the style parser reads it
                // verbatim. Was UNKNOWN, which broke every `fill:#…`.
                while (this.isAlphaNumeric(this.peek()))
                    this.advance();
                this.addToken(TokenType.IDENTIFIER, this.input.substring(start, this.position), start, this.position);
                break;
            case '[':
                this.scanSquareBracket(start, startColumn);
                break;
            case ']':
                this.scanSquareClose(start);
                break;
            case '(':
                this.scanRoundBracket(start, startColumn);
                break;
            case ')':
                this.scanRoundBracketClose(start, startColumn);
                break;
            case '{':
                this.scanCurlyBracket(start, startColumn);
                break;
            case '}':
                this.scanCurlyBracketClose(start, startColumn);
                break;
            case '>':
                this.addToken(TokenType.ASYMMETRIC_OPEN, char, start, this.position);
                break;
            case '<':
                this.scanLessThan(start, startColumn);
                break;
            case '/':
                if (this.peek() === ']') {
                    this.advance();
                    this.addToken(TokenType.TRAPEZOID_CLOSE, '/]', start, this.position);
                }
                else {
                    this.addToken(TokenType.UNKNOWN, '/', start, this.position);
                }
                break;
            case '\\':
                if (this.peek() === ']') {
                    this.advance();
                    this.addToken(TokenType.TRAPEZOID_CLOSE, '\\]', start, this.position);
                }
                else {
                    this.addToken(TokenType.UNKNOWN, '\\', start, this.position);
                }
                break;
            case '@':
                this.addToken(TokenType.AT, '@', start, this.position);
                break;
            case '-':
                this.scanDash(start, startColumn);
                break;
            case '=':
                this.scanEquals(start, startColumn);
                break;
            case '.':
                this.scanDot(start, startColumn);
                break;
            case '"':
            case "'":
                this.scanString(char, start, startColumn);
                break;
            default:
                if (this.isDigit(char)) {
                    this.scanNumber(start, startColumn);
                }
                else if (this.isAlpha(char)) {
                    this.scanIdentifier(start, startColumn);
                }
                else {
                    this.addToken(TokenType.UNKNOWN, char, start, this.position);
                }
                break;
        }
    }
    /**
     * Scan square bracket combinations
     */
    scanSquareBracket(start, startColumn) {
        const next = this.peek();
        if (next === '[') {
            // Subroutine: [[
            this.advance();
            this.addToken(TokenType.SUBROUTINE_OPEN, '[[', start, this.position);
        }
        else if (next === '(') {
            // Cylindrical: [(
            this.advance();
            this.addToken(TokenType.CYLINDRICAL_OPEN, '[(', start, this.position);
        }
        else if (next === '/') {
            // Trapezoid: [/
            this.advance();
            this.addToken(TokenType.TRAPEZOID_OPEN, '[/', start, this.position);
        }
        else if (next === '\\') {
            // Trapezoid alt: [\
            this.advance();
            this.addToken(TokenType.TRAPEZOID_OPEN, '[\\', start, this.position);
        }
        else {
            // Regular square: [
            this.addToken(TokenType.SQUARE_OPEN, '[', start, this.position);
        }
    }
    /**
     * Scan the closing of a square-bracket shape. A ']' can close a rectangle
     * ([x]), a stadium ([x] inside ([...]) → close is `])`), or a subroutine
     * ([[x]] → close is `]]`). The lexer never emitted the compound closes, so
     * stadium/subroutine parsing walked to EOF and threw.
     */
    scanSquareClose(start) {
        const next = this.peek();
        if (next === ')') {
            this.advance();
            this.addToken(TokenType.STADIUM_CLOSE, '])', start, this.position);
        }
        else if (next === ']') {
            this.advance();
            this.addToken(TokenType.SUBROUTINE_CLOSE, ']]', start, this.position);
        }
        else {
            this.addToken(TokenType.SQUARE_CLOSE, ']', start, this.position);
        }
    }
    /**
     * Scan round bracket combinations
     */
    scanRoundBracket(start, startColumn) {
        const next = this.peek();
        if (next === '(') {
            // Circle: ((
            this.advance();
            this.addToken(TokenType.CIRCLE_OPEN, '((', start, this.position);
        }
        else if (next === '[') {
            // Stadium: ([
            this.advance();
            this.addToken(TokenType.STADIUM_OPEN, '([', start, this.position);
        }
        else {
            // Regular round: (
            this.addToken(TokenType.ROUND_OPEN, '(', start, this.position);
        }
    }
    /**
     * Scan round bracket close combinations
     */
    scanRoundBracketClose(start, startColumn) {
        const next = this.peek();
        if (next === ')') {
            // Circle close: ))
            this.advance();
            this.addToken(TokenType.CIRCLE_CLOSE, '))', start, this.position);
        }
        else if (next === ']') {
            // Cylindrical close: )]
            this.advance();
            this.addToken(TokenType.CYLINDRICAL_CLOSE, ')]', start, this.position);
        }
        else {
            // Regular round close: )
            this.addToken(TokenType.ROUND_CLOSE, ')', start, this.position);
        }
    }
    /**
     * Scan curly bracket combinations
     */
    scanCurlyBracket(start, startColumn) {
        const next = this.peek();
        if (next === '{') {
            // Hexagon: {{
            this.advance();
            this.addToken(TokenType.HEXAGON_OPEN, '{{', start, this.position);
        }
        else {
            // Regular rhombus: {
            this.addToken(TokenType.RHOMBUS_OPEN, '{', start, this.position);
        }
    }
    /**
     * Scan curly bracket close combinations
     */
    scanCurlyBracketClose(start, startColumn) {
        const next = this.peek();
        if (next === '}') {
            // Hexagon close: }}
            this.advance();
            this.addToken(TokenType.HEXAGON_CLOSE, '}}', start, this.position);
        }
        else {
            // Regular rhombus close: }
            this.addToken(TokenType.RHOMBUS_CLOSE, '}', start, this.position);
        }
    }
    /**
     * Scan less-than combinations: <-->
     */
    scanLessThan(start, startColumn) {
        if (this.peek() === '-' && this.peekNext() === '-') {
            this.advance(); // -
            this.advance(); // -
            if (this.peek() === '>') {
                this.advance(); // >
                this.addToken(TokenType.BIDIRECTIONAL, '<-->', start, this.position);
            }
            else {
                // Just <-- (not standard, treat as unknown)
                this.addToken(TokenType.UNKNOWN, this.input.substring(start, this.position), start, this.position);
            }
        }
        else {
            this.addToken(TokenType.UNKNOWN, '<', start, this.position);
        }
    }
    /**
     * Scan dash combinations: -->, ---, -.->, -.-
     */
    scanDash(start, _startColumn) {
        if (this.peek() === '-') {
            // Solid edge, ANY length: --, ---, ----, … Mermaid uses extra dashes to
            // ask for a longer edge; the semantics are identical, so one token type
            // covers them all. (Old code hard-coded exactly two/three dashes, so
            // `--->` broke into LINE + `->`.)
            while (this.peek() === '-')
                this.advance();
            const terminator = this.peek();
            if (terminator === '>') {
                this.advance();
                this.addToken(TokenType.ARROW, this.input.substring(start, this.position), start, this.position);
            }
            else if (terminator === 'o') {
                this.advance();
                this.addToken(TokenType.CIRCLE_EDGE, this.input.substring(start, this.position), start, this.position);
            }
            else if (terminator === 'x') {
                this.advance();
                this.addToken(TokenType.CROSS_EDGE, this.input.substring(start, this.position), start, this.position);
            }
            else {
                this.addToken(TokenType.LINE, this.input.substring(start, this.position), start, this.position);
            }
        }
        else if (this.peek() === '.') {
            // Dotted edge, ANY length: -.-, -.->, -..-> (extra dots lengthen it).
            while (this.peek() === '.' || this.peek() === '-')
                this.advance();
            if (this.peek() === '>') {
                this.advance();
                this.addToken(TokenType.DOTTED_ARROW, this.input.substring(start, this.position), start, this.position);
            }
            else {
                this.addToken(TokenType.DOTTED_LINE, this.input.substring(start, this.position), start, this.position);
            }
        }
        else {
            this.addToken(TokenType.UNKNOWN, '-', start, this.position);
        }
    }
    /**
     * Scan equals combinations: ==>, ===
     */
    scanEquals(start, startColumn) {
        if (this.peek() === '=' && this.peekNext() === '=') {
            this.advance(); // second =
            this.advance(); // third =
            if (this.peek() === '>') {
                // Thick arrow: ==>
                this.advance(); // >
                this.addToken(TokenType.THICK_ARROW, '==>', start, this.position);
            }
            else {
                // Thick line: ===
                this.addToken(TokenType.THICK_LINE, '===', start, this.position);
            }
        }
        else {
            // Single = (unknown)
            this.addToken(TokenType.UNKNOWN, '=', start, this.position);
        }
    }
    /**
     * Scan dot (for dotted lines) - already handled in scanDash
     */
    scanDot(start, startColumn) {
        this.addToken(TokenType.UNKNOWN, '.', start, this.position);
    }
    /**
     * Scan string literal
     */
    scanString(quote, start, startColumn) {
        let value = '';
        while (!this.isAtEnd() && this.peek() !== quote) {
            if (this.peek() === '\n') {
                this.line++;
                this.column = 0;
            }
            value += this.advance();
        }
        if (this.isAtEnd()) {
            // Unterminated string
            this.addToken(TokenType.UNKNOWN, quote + value, start, this.position);
            return;
        }
        // Consume closing quote
        this.advance();
        this.addToken(TokenType.STRING, value, start, this.position);
    }
    /**
     * Scan number literal
     */
    scanNumber(start, startColumn) {
        while (this.isDigit(this.peek())) {
            this.advance();
        }
        // Check for decimal
        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance(); // .
            while (this.isDigit(this.peek())) {
                this.advance();
            }
        }
        const value = this.input.substring(start, this.position);
        this.addToken(TokenType.NUMBER, value, start, this.position);
    }
    /**
     * Scan identifier or keyword
     */
    scanIdentifier(start, startColumn) {
        // A '-' belongs to the identifier ONLY when a letter/digit follows it
        // (hyphenated ids like `my-node`). A '-' before another '-' or a '.'
        // begins an edge (`-->`, `-.->`) and must end the identifier — this is
        // the glued-arrow fix: `a-->b` was lexing `a--` as one identifier.
        while (this.isAlphaNumeric(this.peek()) ||
            this.peek() === '_' ||
            (this.peek() === '-' && this.isAlphaNumeric(this.peekNext()))) {
            this.advance();
        }
        const value = this.input.substring(start, this.position);
        const type = this.getKeywordType(value);
        this.addToken(type, value, start, this.position);
    }
    /**
     * Scan comment: %% comment text
     */
    scanComment(start) {
        this.advance(); // Second %
        let value = '%%';
        while (!this.isAtEnd() && this.peek() !== '\n') {
            value += this.advance();
        }
        this.addToken(TokenType.COMMENT, value, start, this.position);
    }
    /**
     * Get keyword token type
     */
    getKeywordType(value) {
        const lower = value.toLowerCase();
        const keywords = {
            'flowchart': TokenType.FLOWCHART,
            'graph': TokenType.GRAPH,
            'subgraph': TokenType.SUBGRAPH,
            'end': TokenType.END,
            'bpmn': TokenType.BPMN,
            'erd': TokenType.ERD,
            'classDiagram': TokenType.CLASSDIAAGRAM,
            'TD': TokenType.TD,
            'TB': TokenType.TB,
            'BT': TokenType.BT,
            'RL': TokenType.RL,
            'LR': TokenType.LR,
        };
        return keywords[lower] || keywords[value] || TokenType.IDENTIFIER;
    }
    /**
     * Helper: Add token to list
     */
    addToken(type, value, start, end) {
        const token = createToken(type, value, this.line, this.column - value.length, start, end);
        this.tokens.push(token);
    }
    /**
     * Helper: Advance position and return current character
     */
    advance() {
        const char = this.input[this.position];
        this.position++;
        this.column++;
        return char;
    }
    /**
     * Helper: Peek at current character without advancing
     */
    peek() {
        if (this.isAtEnd())
            return '\0';
        return this.input[this.position];
    }
    /**
     * Helper: Peek at next character
     */
    peekNext() {
        if (this.position + 1 >= this.input.length)
            return '\0';
        return this.input[this.position + 1];
    }
    /**
     * Helper: Check if at end of input
     */
    isAtEnd() {
        return this.position >= this.input.length;
    }
    /**
     * Helper: Check if character is a digit
     */
    isDigit(char) {
        return char >= '0' && char <= '9';
    }
    /**
     * Helper: Check if character is alphabetic
     */
    isAlpha(char) {
        // Any Unicode letter — not ASCII-only. With the ASCII test every Arabic /
        // CJK / Cyrillic character lexed as its own UNKNOWN token and labels came
        // back through the parser one-character-at-a-time ("مرحبا" → "م ر ح ب ا").
        return /\p{L}/u.test(char);
    }
    /**
     * Helper: Check if character is alphanumeric
     */
    isAlphaNumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }
}
//# sourceMappingURL=Lexer.js.map