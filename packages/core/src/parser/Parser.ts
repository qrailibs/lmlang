import { Token } from "../lexer/Token";
import { TokenType } from "../lexer/TokenType";
import { AST } from "./types";
import { Expression, RuntimeLiteral, CallExpression } from "./expressions";
import { Statement, DefStatement, ImportStatement } from "./statements";
import { TOKEN_TO_VAR_TYPE, TYPE_TOKENS } from "./TypeHelpers";

export class Parser {
    private tokens: Token[];
    private current: number = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    public parse(): AST {
        const statements: Statement[] = [];
        while (!this.isAtEnd()) {
            statements.push(this.statement());
        }
        return { statements };
    }

    private statement(): Statement {
        if (this.match(TokenType.Semicolon)) {
            // Skip empty statements/semicolons
            return this.statement();
        }

        if (this.match(TokenType.Import)) {
            return this.importStatement();
        }
        // Variable Declaration: Type Identifier = Expression
        if (this.check(...TYPE_TOKENS)) {
            return this.defStatement();
        }

        if (this.check(TokenType.LAngle)) {
            const expr = this.runtimeLiteral();
            return {
                kind: "ExpressionStatement",
                expression: expr,
                loc: expr.loc,
            };
        }

        if (
            this.check(TokenType.Identifier) ||
            this.check(TokenType.IntLiteral) ||
            this.check(TokenType.DoubleLiteral) ||
            this.check(TokenType.StringLiteral) ||
            this.check(TokenType.BoolLiteral) ||
            this.check(TokenType.Type) ||
            this.check(TokenType.LParen)
        ) {
            const expr = this.expression();
            if (this.check(TokenType.Semicolon)) {
                this.advance();
            }
            return {
                kind: "ExpressionStatement",
                expression: expr,
                loc: expr.loc,
            };
        }

        throw this.error(
            this.peek(),
            `Expected statement (Import, Variable Def, or Block). Found ${this.peek().type}`,
        );
    }

    private importStatement(): ImportStatement {
        // import ...
        const startToken = this.previous(); // 'import' was matched before call
        const imports: { name: string; alias?: string }[] = [];
        let moduleName = "";

        if (this.match(TokenType.LBrace)) {
            // Named imports: { path, ... }
            while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
                const name = this.consume(
                    TokenType.Identifier,
                    "Expected import name",
                ).value;
                imports.push({ name });

                // Handle comma if we had them, but for now just optional
                // If next is Identifier, assume comma was skipped or implicit?
                // Let's assume strict standard: Comma usually required but our Lexer doesn't have it.
                // Assuming space separated or comma is not in TokenType yet.
                // The example: import {path} from ...
            }
            this.consume(TokenType.RBrace, "Expected '}' after imports");
        } else {
            // Default import: import js ...
            const name = this.consume(
                TokenType.Identifier,
                "Expected default import name",
            ).value;
            imports.push({ name, alias: "default" }); // Treating as default
        }

        this.consume(TokenType.From, "Expected 'from'");
        moduleName = this.consume(
            TokenType.StringLiteral,
            "Expected module path",
        ).value;

        return {
            kind: "ImportStatement",
            moduleName,
            imports,
            loc: { line: startToken.line, col: startToken.col },
        };
    }

    private defStatement(): DefStatement {
        // str inputPath = path("./wallet.json");
        const typeToken = this.advance(); // Consumed type (str/obj/int)
        const nameToken = this.consume(
            TokenType.Identifier,
            "Expected variable name",
        );

        this.consume(TokenType.Equals, "Expected '='");
        const value = this.expression();

        if (this.check(TokenType.Semicolon)) {
            this.advance();
        }

        const varType = TOKEN_TO_VAR_TYPE[typeToken.type];

        if (!varType) {
            throw this.error(typeToken, `Unexpected type ${typeToken.type}`);
        }

        return new DefStatement(nameToken.value, value, varType, {
            line: typeToken.line,
            col: typeToken.col,
        });
    }

    private expression(): Expression {
        return this.term();
    }

    private term(): Expression {
        let left = this.factor();

        while (this.match(TokenType.PlusOp, TokenType.MinusOp)) {
            const operator =
                this.previous().type === TokenType.PlusOp ? "+" : "-";
            const right = this.factor();
            left = {
                type: "BinaryExpression",
                operator: operator as "+" | "-",
                left,
                right,
                loc: left.loc,
            };
        }

        return left;
    }

    private factor(): Expression {
        let left = this.conversion();

        while (this.match(TokenType.MultiplyOp, TokenType.DivideOp)) {
            const operator =
                this.previous().type === TokenType.MultiplyOp ? "*" : "/";
            const right = this.conversion();
            left = {
                type: "BinaryExpression",
                operator: operator as "*" | "/",
                left,
                right,
                loc: left.loc,
            };
        }

        return left;
    }

    private conversion(): Expression {
        let left = this.unary();

        while (this.match(TokenType.ConvertOp)) {
            const startToken = this.previous();
            // Expect type token
            if (this.match(...TYPE_TOKENS)) {
                const typeToken = this.previous();
                const targetType = TOKEN_TO_VAR_TYPE[typeToken.type];

                left = {
                    type: "TypeConversionExpression",
                    value: left,
                    targetType,
                    loc: { line: startToken.line, col: startToken.col },
                };
            } else {
                throw this.error(this.peek(), "Expected type for conversion");
            }
        }
        return left;
    }

    private unary(): Expression {
        if (this.match(TokenType.Type)) {
            const token = this.previous();
            const right = this.unary();
            return {
                type: "TypeCheckExpression",
                value: right,
                loc: { line: token.line, col: token.col },
            };
        }
        return this.primary();
    }

    private primary(): Expression {
        if (this.match(TokenType.IntLiteral)) {
            const token = this.previous();
            return {
                type: "IntLiteral",
                value: parseInt(token.value, 10),
                loc: { line: token.line, col: token.col },
            };
        }
        if (this.match(TokenType.DoubleLiteral)) {
            const token = this.previous();
            return {
                type: "DoubleLiteral",
                value: parseFloat(token.value),
                loc: { line: token.line, col: token.col },
            };
        }
        if (this.match(TokenType.BoolLiteral)) {
            const token = this.previous();
            return {
                type: "BoolLiteral",
                value: token.value === "true",
                loc: { line: token.line, col: token.col },
            };
        }
        if (this.match(TokenType.StringLiteral)) {
            const token = this.previous();
            return {
                type: "StringLiteral",
                value: token.value,
                loc: { line: token.line, col: token.col },
            };
        }
        if (this.match(TokenType.Identifier)) {
            const token = this.previous();
            if (this.match(TokenType.LParen)) {
                return this.finishCall(token.value, token);
            }
            return {
                type: "VarReference",
                varName: token.value,
                loc: { line: token.line, col: token.col },
            };
        }

        if (
            this.match(
                TokenType.TypeStr,
                TokenType.TypeObj,
                TokenType.TypeInt,
                TokenType.TypeDbl,
                TokenType.TypeBool,
            )
        ) {
            const name = this.previous().value; // "int", "dbl", "str" (from keyword value not token type if value is set correctly in lexer? Lexer value for keyword is the string "int" etc)
            // Wait, Lexer.ts readIdentifier sets token type based on keywords map.
            // But value is the text.
            // Check Lexer.ts:
            // const type = KEYWORDS[value] || TokenType.Identifier;
            // return { type, value, ... }
            // So value is "int", "double", etc.

            if (this.match(TokenType.LParen)) {
                return this.finishCall(name, this.previous());
            }

            // If just "int", it's a type usage in expression? Not valid unless checking type?
            // "int" as a value?
            // function fn(type t) ?
            // For now, only support calls.
            throw this.error(
                this.previous(),
                `Unexpected use of type '${name}' in expression.`,
            );
        }

        if (this.check(TokenType.LAngle)) {
            return this.runtimeLiteral();
        }

        if (this.match(TokenType.LParen)) {
            const expr = this.expression();
            this.consume(TokenType.RParen, "Expected ')'");
            return expr;
        }

        throw this.error(
            this.peek(),
            `Expected expression, found ${this.peek().type}`,
        );
    }

    private runtimeLiteral(): RuntimeLiteral {
        // <name ctxField={value}> ... </name>
        const startToken = this.consume(TokenType.LAngle, "Expected '<'");
        const runtimeName = this.consume(
            TokenType.Identifier,
            "Expected runtime name",
        ).value;
        const attributes: Record<string, Expression> = {};

        // Parse attributes until RAngle
        while (!this.check(TokenType.RAngle) && !this.isAtEnd()) {
            // attr={val}
            const attrName = this.consume(
                TokenType.Identifier,
                "Expected attribute name",
            ).value;
            this.consume(TokenType.Equals, "Expected '='");
            this.consume(TokenType.LBrace, "Expected '{'");
            const expr = this.expression();
            this.consume(TokenType.RBrace, "Expected '}'");

            attributes[attrName] = expr;
        }
        this.consume(TokenType.RAngle, "Expected '>'");

        // Raw Code Body
        const codeToken = this.consume(
            TokenType.RuntimeBlockBody,
            "Expected runtime code body",
        );

        // Closing tag </name>
        this.consume(TokenType.LAngle, "Expected closing tag '<'");
        this.consume(TokenType.DivideOp, "Expected '/'");
        const closingName = this.consume(
            TokenType.Identifier,
            "Expected closing tag name",
        ).value;
        if (closingName !== runtimeName) {
            throw this.error(
                this.previous(),
                `Expected closing tag for ${runtimeName}, found ${closingName}`,
            );
        }
        this.consume(TokenType.RAngle, "Expected '>'"); // Close >

        return {
            type: "RuntimeLiteral",
            runtimeName,
            attributes,
            code: codeToken.value,
            loc: { line: startToken.line, col: startToken.col },
        };
    }

    private finishCall(callee: string, startToken?: Token): CallExpression {
        const token = startToken || this.previous();
        const args: Expression[] = [];
        if (!this.check(TokenType.RParen)) {
            do {
                args.push(this.expression());
            } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RParen, "Expected ')'");
        return {
            type: "CallExpression",
            callee,
            arguments: args,
            loc: { line: token.line, col: token.col },
        };
    }

    private match(...types: TokenType[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        throw this.error(this.peek(), message);
    }

    private check(...types: TokenType[]): boolean {
        if (this.isAtEnd()) return false;
        const currentType = this.peek().type;
        return types.includes(currentType);
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private error(token: Token, message: string): Error {
        return new Error(
            `[Line ${token.line}, Col ${token.col}] Error at '${token.value}': ${message}`,
        );
    }
}
