import { Token } from "../lexer/Token";
import { TokenType } from "../lexer/TokenType";
import { AST, SourceLocation, VariableType } from "./types";
import { Expression, RuntimeLiteral, CallExpression } from "./expressions";
import {
    Statement,
    DefStatement,
    ImportStatement,
    ReturnStatement,
    AssignmentStatement,
} from "./statements";
import { TOKEN_TO_VAR_TYPE, TYPE_TOKENS } from "./TypeHelpers";
import { LmlangError } from "../utils/Error";

export class Parser {
    private tokens: Token[];
    private current: number = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    public parse(): AST {
        const statements: Statement[] = [];
        while (!this.isAtEnd()) {
            if (this.match(TokenType.Semicolon)) continue;
            statements.push(this.statement());
        }
        return { statements };
    }

    private getLoc(token: Token): SourceLocation {
        return {
            line: token.line,
            col: token.col,
            len: token.length || token.value.length,
            endLine: token.line,
            endCol: token.col + (token.length || token.value.length),
        };
    }

    private mergeLoc(
        start: SourceLocation | undefined,
        end: SourceLocation | undefined,
    ): SourceLocation {
        if (!start)
            return end || { line: 0, col: 0, endLine: 0, endCol: 0, len: 0 };
        if (!end) return start;

        const len =
            start.line === end.endLine ? end.endCol - start.col : start.len;

        return {
            line: start.line,
            col: start.col,
            len: len,
            endLine: end.endLine,
            endCol: end.endCol,
        };
    }

    private statement(): Statement {
        if (this.match(TokenType.Semicolon)) {
            // If we have a standalone semicolon, it's an empty statement.
            // Since we don't have an EmptyStatement AST node, we rely on callers (parse/block) to skip it?
            // OR we throw for now if we can't return.
            // But 'statement()' MUST return a Statement.
            // Changing strategy: callers skip semicolons.
            // If we are here, caller didn't skip.
            // We'll recurse, but we must ensure we don't hit EOF/RBrace.
            if (this.isAtEnd() || this.check(TokenType.RBrace)) {
                // This effectively means "Empty Statement at end of block".
                // But we have to return something.
                // Let's return a dummy block? Or fix callers.
                // Fixing callers is better.
                // But for this tool step, I'm just removing this block so callers MUST handle it?
                // No, if I remove it, it will fall through to error "Expected statement... Found ;"
            }
            return this.statement();
        }

        if (this.match(TokenType.Import)) {
            return this.importStatement();
        }
        // Variable Declaration
        if (this.check(...TYPE_TOKENS)) {
            return this.defStatement();
        }

        // Assignment: Identifier = Expression
        if (
            this.check(TokenType.Identifier) &&
            this.peekNext().type === TokenType.Equals
        ) {
            return this.assignmentStatement();
        }

        if (this.match(TokenType.Return)) {
            return this.returnStatement();
        }

        if (this.check(TokenType.LBrace)) {
            return this.blockStatement();
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
        let moduleNameToken: Token;

        if (this.match(TokenType.LBrace)) {
            // Named imports: { path, ... }
            while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
                const name = this.consume(
                    TokenType.Identifier,
                    "Expected import name",
                ).value;
                imports.push({ name });
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
        moduleNameToken = this.consume(
            TokenType.StringLiteral,
            "Expected module path",
        );

        return {
            kind: "ImportStatement",
            moduleName: moduleNameToken.value,
            imports,
            loc: this.mergeLoc(
                this.getLoc(startToken),
                this.getLoc(moduleNameToken),
            ),
        };
    }

    private returnStatement(): ReturnStatement {
        const keyword = this.previous();
        let value: Expression | undefined;

        // Check if next token starts an expression
        if (
            !this.check(TokenType.Semicolon) &&
            !this.check(TokenType.RBrace) &&
            !this.isAtEnd()
        ) {
            value = this.expression();
        }

        if (this.check(TokenType.Semicolon)) {
            this.advance();
        }

        return {
            kind: "ReturnStatement",
            value,
            loc: this.mergeLoc(
                this.getLoc(keyword),
                value ? value.loc : undefined,
            ),
        };
    }

    private blockStatement(): Statement {
        const startToken = this.consume(TokenType.LBrace, "Expected '{'");
        const statements: Statement[] = [];

        while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
            if (this.match(TokenType.Semicolon)) continue;
            statements.push(this.statement());
        }

        const endToken = this.consume(TokenType.RBrace, "Expected '}'");

        return {
            kind: "BlockStatement",
            statements,
            loc: this.mergeLoc(this.getLoc(startToken), this.getLoc(endToken)),
        };
    }

    private defStatement(): DefStatement {
        // str inputPath = path("./wallet.json");
        const typeToken = this.advance(); // Consumed type (str/obj/int)
        const nameToken = this.consume(
            TokenType.Identifier,
            "Expected variable name",
        );

        // Check if function definition style: func name (...) : type { ... }
        if (
            typeToken.type === TokenType.TypeFunc &&
            this.check(TokenType.LParen)
        ) {
            return this.funcDeclaration(nameToken, typeToken);
        }

        this.consume(TokenType.Equals, "Expected '='");
        const value = this.expression();

        if (this.check(TokenType.Semicolon)) {
            this.advance();
        }

        const varType = TOKEN_TO_VAR_TYPE[typeToken.type];

        if (!varType) {
            throw this.error(typeToken, `Unexpected type ${typeToken.type}`);
        }

        if (varType === "void") {
            throw this.error(typeToken, `Variable cannot be of type 'void'`);
        }

        const endLoc = value.loc;
        // Or if semicolon present, ideally end there, but value.loc is simpler range.

        return new DefStatement(
            nameToken.value,
            value,
            varType as VariableType, // Safe cast after check
            this.mergeLoc(this.getLoc(typeToken), endLoc),
        );
    }

    private assignmentStatement(): AssignmentStatement {
        const nameToken = this.consume(
            TokenType.Identifier,
            "Expected variable name",
        );
        this.consume(TokenType.Equals, "Expected '='");
        const value = this.expression();

        if (this.check(TokenType.Semicolon)) {
            this.advance();
        }

        return new AssignmentStatement(
            nameToken.value,
            value,
            this.mergeLoc(this.getLoc(nameToken), value.loc),
        );
    }

    private funcDeclaration(nameToken: Token, startToken: Token): DefStatement {
        // func name (params) : returnType { body }
        // Parsed as DefStatement with LambdaExpression value

        // 1. Parsing params
        this.consume(TokenType.LParen, "Expected '(' after function name");
        const params: { name: string; type: any }[] = [];
        if (!this.check(TokenType.RParen)) {
            do {
                const typeTok = this.consumeType("Expected parameter type");
                const paramName = this.consume(
                    TokenType.Identifier,
                    "Expected parameter name",
                );
                const type = TOKEN_TO_VAR_TYPE[typeTok.type];
                if (type === "void") {
                    throw this.error(typeTok, "Parameter cannot be 'void'");
                }
                params.push({
                    name: paramName.value,
                    type: type as VariableType,
                });
            } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RParen, "Expected ')' after parameters");

        // 2. Return Type
        this.consume(TokenType.Colon, "Expected ':' before return type");
        const returnTypeTok = this.consumeType("Expected return type");
        const returnType = TOKEN_TO_VAR_TYPE[returnTypeTok.type];

        // 3. Body
        let body: Statement[] | Expression;
        let endLoc;

        if (this.check(TokenType.LBrace)) {
            const block = this.blockStatement() as any; // BlockStatement
            body = block.statements;
            endLoc = block.loc;
        } else {
            // Single expression body imply using Arrow? No, func naming usually uses block.
            // But valid syntax could be `func name(): int => expr;`?
            // The prompt example 2 is `func sum (int a, int): int { return a + b }`
            // So it expects block.

            // If user wants => expr, let's support it if we want unification.
            // But for named func, let's stick to Block.
            throw this.error(this.peek(), "Expected '{' for function body.");
        }

        const lambda: Expression = {
            type: "LambdaExpression",
            params,
            returnType,
            body,
            loc: this.mergeLoc(this.getLoc(startToken), endLoc),
        };

        return new DefStatement(nameToken.value, lambda, "func", lambda.loc!);
    }

    private consumeType(msg: string): Token {
        if (this.match(...TYPE_TOKENS)) {
            return this.previous();
        }
        throw this.error(this.peek(), msg);
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
                loc: this.mergeLoc(left.loc, right.loc),
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
                loc: this.mergeLoc(left.loc, right.loc),
            };
        }

        return left;
    }

    private conversion(): Expression {
        let left = this.unary();

        while (this.match(TokenType.ConvertOp)) {
            const startToken = this.previous(); // '~' isn't start, left is.
            // Wait, conversion is `left ~ type`.
            // So start is left.loc.
            // Op is matched.

            // Expect type token
            if (this.match(...TYPE_TOKENS)) {
                const typeToken = this.previous();
                const targetType = TOKEN_TO_VAR_TYPE[typeToken.type];

                if (targetType === "void") {
                    throw this.error(typeToken, `Cannot convert to 'void'`);
                }

                left = {
                    type: "TypeConversionExpression",
                    value: left,
                    targetType: targetType as VariableType, // Safe cast
                    loc: this.mergeLoc(left.loc, this.getLoc(typeToken)),
                };
            } else {
                throw this.error(this.peek(), "Expected type for conversion");
            }
        }
        return left;
    }

    private unary(): Expression {
        if (this.match(TokenType.PlusPlus, TokenType.MinusMinus)) {
            const operatorToken = this.previous();
            const operator =
                operatorToken.type === TokenType.PlusPlus ? "++" : "--";
            const right = this.postfix(); // Right side of prefix

            if (right.type !== "VarReference") {
                throw this.error(
                    operatorToken,
                    "Invalid left-hand side expression in prefix operation",
                );
            }

            return {
                type: "UpdateExpression",
                operator,
                varName: right.varName,
                prefix: true,
                loc: this.mergeLoc(this.getLoc(operatorToken), right.loc),
            };
        }

        if (this.match(TokenType.Type)) {
            const token = this.previous();
            const right = this.unary();
            return {
                type: "TypeCheckExpression",
                value: right,
                loc: this.mergeLoc(this.getLoc(token), right.loc),
            };
        }
        return this.postfix();
    }

    private postfix(): Expression {
        const expr = this.primary();

        if (this.match(TokenType.PlusPlus, TokenType.MinusMinus)) {
            const operatorToken = this.previous();
            const operator =
                operatorToken.type === TokenType.PlusPlus ? "++" : "--";

            if (expr.type !== "VarReference") {
                throw this.error(
                    operatorToken,
                    "Invalid left-hand side expression in postfix operation",
                );
            }

            return {
                type: "UpdateExpression",
                operator,
                varName: expr.varName,
                prefix: false,
                loc: this.mergeLoc(expr.loc, this.getLoc(operatorToken)),
            };
        }

        return expr;
    }

    private primary(): Expression {
        if (this.match(TokenType.IntLiteral)) {
            const token = this.previous();
            return {
                type: "IntLiteral",
                value: parseInt(token.value, 10),
                loc: this.getLoc(token),
            };
        }
        if (this.match(TokenType.DoubleLiteral)) {
            const token = this.previous();
            return {
                type: "DoubleLiteral",
                value: parseFloat(token.value),
                loc: this.getLoc(token),
            };
        }
        if (this.match(TokenType.BoolLiteral)) {
            const token = this.previous();
            return {
                type: "BoolLiteral",
                value: token.value === "true",
                loc: this.getLoc(token),
            };
        }
        if (this.match(TokenType.StringLiteral)) {
            const token = this.previous();
            return {
                type: "StringLiteral",
                value: token.value,
                loc: this.getLoc(token),
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
                loc: this.getLoc(token),
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
            const name = this.previous().value;
            if (this.match(TokenType.LParen)) {
                return this.finishCall(name, this.previous());
            }

            throw this.error(
                this.previous(),
                `Unexpected use of type '${name}' in expression.`,
            );
        }

        if (this.check(TokenType.LAngle)) {
            return this.runtimeLiteral();
        }

        if (this.check(TokenType.LParen)) {
            return this.handleLParen();
        }

        throw this.error(
            this.peek(),
            `Expected expression, found "${this.peek().value}"`,
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
        const endToken = this.consume(TokenType.RAngle, "Expected '>'"); // Close >

        return {
            type: "RuntimeLiteral",
            runtimeName,
            attributes,
            code: codeToken.value,
            loc: this.mergeLoc(this.getLoc(startToken), this.getLoc(endToken)),
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
        const endToken = this.consume(TokenType.RParen, "Expected ')'");
        return {
            type: "CallExpression",
            callee,
            arguments: args,
            loc: this.mergeLoc(this.getLoc(token), this.getLoc(endToken)),
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

    private handleLParen(): Expression {
        const startParen = this.consume(TokenType.LParen, "Expected '('");

        // Speculatively check if it is a lambda param list.
        // Lambda: ( [Type Ident [, ...]] ) : Type => ...
        // Paren: ( Expr )

        // If immediately `)`, likely lambda (empty params) or empty tuple (null?).
        // If `Type` token, likely lambda param start?
        // What if `(int)`? Could be `int` type used as expression?
        // `primary` supports `Type...` as call `int(...)`.
        // So `(int(5))` is valid paren expr.
        // But `(int a)` is invalid expr (a is unexpected after int type).

        // Let's check if the NEXT token after `Type` is `Identifier`?
        // `int a` -> `TypeInt` `Identifier`.
        // `int (5)` -> `TypeInt` `LParen`.

        let isLambda = false;
        if (this.check(TokenType.RParen)) {
            // `()`
            // Could be empty lambda params?
            isLambda = true; // Assume lambda if empty? `()` as Unit?
            // We need to check if followed by `:`?
            // `(): int => ...`
        } else if (this.isTypeToken(this.peek())) {
            // Look ahead 1
            const typeToken = this.peek();
            const nextIdx = this.current + 1;
            if (nextIdx < this.tokens.length) {
                const nextTok = this.tokens[nextIdx];
                if (nextTok.type === TokenType.Identifier) {
                    // `Type Ident` -> It is a lambda param declaration.
                    isLambda = true;
                }
            }
        }

        if (isLambda) {
            return this.lambdaExpression(startParen);
        }

        // Otherwise parsed as Parenthesized Expression
        const expr = this.expression();
        const endParen = this.consume(TokenType.RParen, "Expected ')'");
        if (expr.loc) {
            expr.loc = this.mergeLoc(
                this.getLoc(startParen),
                this.getLoc(endParen),
            );
        }
        return expr;
    }

    private isTypeToken(t: Token): boolean {
        return TYPE_TOKENS.includes(t.type);
    }

    private lambdaExpression(startParen: Token): Expression {
        const params: { name: string; type: any }[] = [];
        if (!this.check(TokenType.RParen)) {
            do {
                const typeTok = this.consumeType("Expected parameter type");
                const paramName = this.consume(
                    TokenType.Identifier,
                    "Expected parameter name",
                );
                const type = TOKEN_TO_VAR_TYPE[typeTok.type];
                if (type === "void") {
                    throw this.error(typeTok, "Parameter cannot be 'void'");
                }
                params.push({
                    name: paramName.value,
                    type: type as VariableType,
                });
            } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RParen, "Expected ')' after parameters");

        // Return Type
        // Lambda syntax: (params): type => body
        // Or (params) => body (inferred?) -> Prompt says `: int` in example 1.
        this.consume(TokenType.Colon, "Expected ':' before return type");
        const returnTypeTok = this.consumeType("Expected return type");
        const returnType = TOKEN_TO_VAR_TYPE[returnTypeTok.type];

        this.consume(TokenType.Arrow, "Expected '=>'");

        // Body
        let body: Expression | Statement[];
        let endLoc;
        if (this.check(TokenType.LBrace)) {
            // Block body
            const block = this.blockStatement() as any; // BlockStatement
            body = block.statements;
            endLoc = block.loc;
        } else {
            // Expression body
            const expr = this.expression();
            body = expr; // Expression
            endLoc = expr.loc;
        }

        return {
            type: "LambdaExpression",
            params,
            returnType,
            body,
            loc: this.mergeLoc(this.getLoc(startParen), endLoc),
        };
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

    private peekNext(): Token {
        if (this.current + 1 >= this.tokens.length)
            return this.tokens[this.tokens.length - 1]; // Return EOF if out of bounds
        return this.tokens[this.current + 1];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private error(token: Token, message: string): Error {
        return new LmlangError(message, this.getLoc(token));
    }
}
