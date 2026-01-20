import { Token } from "./Token";
import { TokenType } from "./TokenType";

const KEYWORDS: Record<string, TokenType> = {
    import: TokenType.Import,
    from: TokenType.From,
    return: TokenType.Return,

    // Type annotations
    str: TokenType.TypeStr,
    obj: TokenType.TypeObj,
    int: TokenType.TypeInt,
    dbl: TokenType.TypeDbl,
    bool: TokenType.TypeBool,
};

export class Lexer {
    private input: string;
    private position: number = 0;
    private line: number = 1;
    private col: number = 1;

    // State for parsing runtime blocks
    private state: "NORMAL" | "TAG_HEADER" | "TAG_BODY" = "NORMAL";
    private currentTagName: string | null = null;

    constructor(input: string) {
        this.input = input;
    }

    public tokenize(): Token[] {
        const tokens: Token[] = [];

        while (this.position < this.input.length) {
            // Handle TAG_BODY state to capture raw code
            if (this.state === "TAG_BODY" && this.currentTagName) {
                const bodyToken = this.readUntilCloseTag(this.currentTagName);
                if (bodyToken) tokens.push(bodyToken);
                // Reset state to parse closing tag
                this.state = "NORMAL";
                this.currentTagName = null;
                continue;
            }

            const char = this.currentChar();

            if (this.isWhitespace(char)) {
                this.advance();
                continue;
            }

            if (char === "/" && this.peekChar() === "/") {
                this.skipComment();
                continue;
            }

            if (char === "<") {
                // Check if closing tag </
                if (this.peekChar() === "/") {
                    tokens.push(this.createToken(TokenType.LAngle, "<"));
                    this.advance();
                    tokens.push(this.createToken(TokenType.DivideOp, "/"));
                    this.advance();
                    continue;
                }

                // Check if start tag <Identifier
                if (this.isAlpha(this.peekChar())) {
                    tokens.push(this.createToken(TokenType.LAngle, "<"));
                    this.advance();
                    this.state = "TAG_HEADER";
                    continue;
                }

                // Just LessThan operator
                tokens.push(this.createToken(TokenType.LAngle, "<"));
                this.advance();
                continue;
            }

            if (char === ">") {
                tokens.push(this.createToken(TokenType.RAngle, ">"));
                this.advance();

                if (this.state === "TAG_HEADER") {
                    this.state = "TAG_BODY";
                    // Find the tag name from previous tokens.
                    // Sequence: LAngle, Identifier, [Attributes...], RAngle(just added)
                    // We scan backwards for the last LAngle.
                    let i = tokens.length - 2;
                    while (i >= 0) {
                        if (tokens[i].type === TokenType.LAngle) {
                            if (
                                i + 1 < tokens.length &&
                                tokens[i + 1].type === TokenType.Identifier
                            ) {
                                this.currentTagName = tokens[i + 1].value;
                            }
                            break;
                        }
                        i--;
                    }
                }
                continue;
            }

            if (char === "/") {
                tokens.push(this.createToken(TokenType.DivideOp, "/"));
                this.advance();
                continue;
            }
            if (char === "*") {
                tokens.push(this.createToken(TokenType.MultiplyOp, "*"));
                this.advance();
                continue;
            }
            if (char === "+") {
                tokens.push(this.createToken(TokenType.PlusOp, "+"));
                this.advance();
                continue;
            }
            if (char === "-") {
                tokens.push(this.createToken(TokenType.MinusOp, "-"));
                this.advance();
                continue;
            }
            if (char === "=") {
                tokens.push(this.createToken(TokenType.Equals, "="));
                this.advance();
                continue;
            }
            if (char === ";") {
                tokens.push(this.createToken(TokenType.Semicolon, ";"));
                this.advance();
                continue;
            }
            if (char === "{") {
                tokens.push(this.createToken(TokenType.LBrace, "{"));
                this.advance();
                continue;
            }
            if (char === "}") {
                tokens.push(this.createToken(TokenType.RBrace, "}"));
                this.advance();
                continue;
            }
            if (char === ".") {
                tokens.push(this.createToken(TokenType.Dot, "."));
                this.advance();
                continue;
            }
            if (char === "(") {
                tokens.push(this.createToken(TokenType.LParen, "("));
                this.advance();
                continue;
            }
            if (char === ")") {
                tokens.push(this.createToken(TokenType.RParen, ")"));
                this.advance();
                continue;
            }

            if (char === '"' || char === "'") {
                tokens.push(this.readString(char));
                continue;
            }

            if (this.isAlpha(char)) {
                tokens.push(this.readIdentifier());
                continue;
            }

            if (this.isDigit(char)) {
                tokens.push(this.readNumber());
                continue;
            }

            throw new Error(
                `Unexpected character '${char}' at ${this.line}:${this.col}`,
            );
        }

        tokens.push(this.createToken(TokenType.EOF, ""));
        return tokens;
    }

    private readUntilCloseTag(tagName: string): Token | null {
        const startLine = this.line;
        const startCol = this.col;
        let value = "";

        while (this.position < this.input.length) {
            // Check for </tagName>
            if (this.currentChar() === "<" && this.peekChar() === "/") {
                const potentialTagName = this.input.substring(
                    this.position + 2,
                    this.position + 2 + tagName.length,
                );
                if (potentialTagName === tagName) {
                    break;
                }
            }
            value += this.currentChar();
            this.advance();
        }

        if (value.length === 0) return null;

        return {
            type: TokenType.RuntimeBlockBody,
            value,
            line: startLine,
            col: startCol,
        };
    }

    private createToken(type: TokenType, value: string): Token {
        return { type, value, line: this.line, col: this.col };
    }

    private advance() {
        if (this.currentChar() === "\n") {
            this.line++;
            this.col = 1;
        } else {
            this.col++;
        }
        this.position++;
    }

    private currentChar(): string {
        return this.input[this.position];
    }

    private peekChar(offset = 1): string {
        if (this.position + offset >= this.input.length) return "";
        return this.input[this.position + offset];
    }

    private isWhitespace(char: string): boolean {
        return /\s/.test(char);
    }

    private isAlpha(char: string): boolean {
        return /[a-zA-Z_]/.test(char);
    }

    private isAlphaNumeric(char: string): boolean {
        return /[a-zA-Z0-9_]/.test(char);
    }

    private isDigit(char: string): boolean {
        return /[0-9]/.test(char);
    }

    private readNumber(): Token {
        const startLine = this.line;
        const startCol = this.col;
        let value = "";
        let isDouble = false;

        while (
            this.position < this.input.length &&
            this.isDigit(this.currentChar())
        ) {
            value += this.currentChar();
            this.advance();
        }

        if (this.currentChar() === "." && this.isDigit(this.peekChar())) {
            isDouble = true;
            value += ".";
            this.advance(); // consume dot

            while (
                this.position < this.input.length &&
                this.isDigit(this.currentChar())
            ) {
                value += this.currentChar();
                this.advance();
            }
        }

        return {
            type: isDouble ? TokenType.DoubleLiteral : TokenType.IntLiteral,
            value,
            line: startLine,
            col: startCol,
        };
    }

    private readString(quote: string): Token {
        const startLine = this.line;
        const startCol = this.col;
        this.advance(); // skip quote

        let value = "";
        while (
            this.position < this.input.length &&
            this.currentChar() !== quote
        ) {
            value += this.currentChar();
            this.advance();
        }

        if (this.position >= this.input.length)
            throw new Error("Unterminated string");
        this.advance(); // skip close quote

        return {
            type: TokenType.StringLiteral,
            value,
            line: startLine,
            col: startCol,
        };
    }

    private readIdentifier(): Token {
        const startLine = this.line;
        const startCol = this.col;
        let value = "";

        while (
            this.position < this.input.length &&
            this.isAlphaNumeric(this.currentChar())
        ) {
            value += this.currentChar();
            this.advance();
        }

        const type = KEYWORDS[value] || TokenType.Identifier;
        return { type, value, line: startLine, col: startCol };
    }

    private skipComment() {
        while (
            this.position < this.input.length &&
            this.currentChar() !== "\n"
        ) {
            this.advance();
        }
    }
}
