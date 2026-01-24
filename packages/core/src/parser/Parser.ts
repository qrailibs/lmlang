import {
    AST,
    FunctionReturnType,
    SourceLocation,
    Statement,
    VariableType,
    PrimitiveType,
} from "../types/ast";
import {
    Token,
    TOKEN_TO_VAR_TYPE,
    TokenType,
    TYPE_TOKENS,
} from "../types/token";
import { makeError } from "../utils/err";
import {
    Expression,
    RuntimeLiteral,
    CallExpression,
    LambdaExpression,
} from "../types/expression";
import {
    DefStatement,
    ImportStatement,
    ReturnStatement,
    AssignmentStatement,
    IfStatement,
} from "./statements";

export class Parser {
    private tokens: Token[];
    private current: number = 0;
    private source: string;

    constructor(tokens: Token[], source: string) {
        this.tokens = tokens;
        this.source = source;
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

        if (this.match(TokenType.Export)) {
            return this.defStatement(true);
        }

        if (this.match(TokenType.Import)) {
            return this.importStatement();
        }
        // Variable Declaration
        if (this.check(...TYPE_TOKENS)) {
            return this.defStatement();
        }

        if (this.match(TokenType.Return)) {
            return this.returnStatement();
        }

        if (this.check(TokenType.LBrace)) {
            return this.blockStatement();
        }

        if (this.check(TokenType.If)) {
            return this.ifStatement();
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
            this.check(TokenType.Typeof) ||
            this.check(TokenType.LParen)
        ) {
            const expr = this.expression();

            if (this.match(TokenType.Equals)) {
                const value = this.expression();
                if (this.check(TokenType.Semicolon)) {
                    this.advance();
                }
                return new AssignmentStatement(
                    expr,
                    value,
                    this.mergeLoc(expr.loc, value.loc),
                );
            }

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

    private ifStatement(): IfStatement {
        const startToken = this.consume(TokenType.If, "Expected 'if'");
        this.consume(TokenType.LParen, "Expected '(' after 'if'");
        const condition = this.expression();
        this.consume(TokenType.RParen, "Expected ')' after condition");

        const thenBranch = this.statement();
        let elseBranch: Statement | undefined;

        if (this.match(TokenType.Else)) {
            elseBranch = this.statement();
        }

        return new IfStatement(
            condition,
            thenBranch,
            elseBranch,
            this.mergeLoc(
                this.getLoc(startToken),
                elseBranch ? elseBranch.loc : thenBranch.loc,
            ),
        );
    }

    private defStatement(isExported: boolean = false): DefStatement {
        // str inputPath = path("./wallet.json");
        const typeInfo = this.parseType("Expected type");
        const nameToken = this.consume(
            TokenType.Identifier,
            "Expected variable name",
        );

        // Check if function definition style: func name (...) : type { ... }
        // For func, typeInfo.type is 'func'
        if (typeInfo.type === "func" && this.check(TokenType.LParen)) {
            return this.funcDeclaration(nameToken, typeInfo.loc, isExported);
        }

        this.consume(TokenType.Equals, "Expected '='");
        const value = this.expression();

        if (this.check(TokenType.Semicolon)) {
            this.advance();
        }

        const varType = typeInfo.type;

        if (varType === "void") {
            throw this.error(nameToken, `Variable cannot be of type 'void'`);
        }

        const endLoc = value.loc;

        return new DefStatement(
            nameToken.value,
            value,
            varType as VariableType,
            this.mergeLoc(typeInfo.loc, endLoc),
            isExported,
        );
    }

    private funcDeclaration(
        nameToken: Token,
        startLoc: SourceLocation,
        isExported: boolean = false,
    ): DefStatement {
        // func name (params) : returnType { body }
        const lambda = this.parseLambdaBody(startLoc);

        return new DefStatement(
            nameToken.value,
            lambda,
            "func",
            lambda.loc!,
            isExported,
        );
    }

    private parseLambdaBody(startLoc: SourceLocation): LambdaExpression {
        // (params) : returnType { body }

        // 1. Parsing params
        this.consume(
            TokenType.LParen,
            "Expected '(' after function keyword/name",
        );
        const params: { name: string; type: any }[] = [];
        if (!this.check(TokenType.RParen)) {
            do {
                const typeInfo = this.parseType("Expected parameter type");
                const paramName = this.consume(
                    TokenType.Identifier,
                    "Expected parameter name",
                );
                if (typeInfo.type === "void") {
                    throw this.error(paramName, "Parameter cannot be 'void'");
                }
                params.push({
                    name: paramName.value,
                    type: typeInfo.type as VariableType,
                });
            } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RParen, "Expected ')' after parameters");

        // 2. Return Type
        let returnType: FunctionReturnType = "void";
        if (this.match(TokenType.Colon)) {
            const returnTypeInfo = this.parseType("Expected return type");
            returnType = returnTypeInfo.type;
        }

        // 3. Body
        let body: Statement[] | Expression;
        let endLoc: SourceLocation | undefined;

        if (this.check(TokenType.LBrace)) {
            const block = this.blockStatement() as any; // BlockStatement
            body = block.statements;
            endLoc = block.loc;
        } else {
            // For standard func declarations, we expect block.
            // But valid lambda expressions can have single expression bodies too?
            // Based on `lambdaExpression` (arrow func), it supports both.
            // The old `funcDeclaration` REQUIRED LBrace.
            // Let's stick to LBrace for `func` syntax to distinguish from arrow funcs if we want?
            // Or allow both? User request: "func inside object as field" implies standard syntax usually.
            // The original code threw: "Expected '{' for function body."
            // I will keep requiring '{' for `func` style lambdas for now to match original behavior,
            // unless we want to relax it. Let's keep it consistent with original `funcDeclaration`.
            throw this.error(this.peek(), "Expected '{' for function body.");
        }

        return {
            type: "LambdaExpression",
            params,
            returnType: returnType as FunctionReturnType,
            body,
            loc: this.mergeLoc(startLoc, endLoc),
        };
    }

    private parseType(msg: string = "Expected type"): {
        type: FunctionReturnType;
        loc: SourceLocation;
    } {
        if (this.match(...TYPE_TOKENS)) {
            const token = this.previous();
            let typeName: VariableType = TOKEN_TO_VAR_TYPE[
                token.type
            ] as PrimitiveType;
            let endLoc = this.getLoc(token);

            // Handle Generics: array[int]
            if (
                token.type === TokenType.TypeArray &&
                this.match(TokenType.LBracket)
            ) {
                const inner = this.parseType("Expected inner type for array");
                if (inner.type === "void")
                    throw this.error(token, "Array cannot hold 'void'");

                const endToken = this.consume(
                    TokenType.RBracket,
                    "Expected ']' after array type",
                );

                typeName = {
                    base: "array",
                    generic: inner.type as VariableType,
                };
                endLoc = this.mergeLoc(
                    this.getLoc(token),
                    this.getLoc(endToken),
                );
            }
            return {
                type: typeName,
                loc: this.mergeLoc(this.getLoc(token), endLoc),
            };
        }
        throw this.error(this.peek(), msg);
    }

    private expression(): Expression {
        return this.logicalOr();
    }

    private logicalOr(): Expression {
        let left = this.logicalAnd();

        while (this.match(TokenType.Or)) {
            const operator = "||";
            const right = this.logicalAnd();
            left = {
                type: "BinaryExpression",
                operator,
                left,
                right,
                loc: this.mergeLoc(left.loc, right.loc),
            };
        }
        return left;
    }

    private logicalAnd(): Expression {
        let left = this.equality();

        while (this.match(TokenType.And)) {
            const operator = "&&";
            const right = this.equality();
            left = {
                type: "BinaryExpression",
                operator,
                left,
                right,
                loc: this.mergeLoc(left.loc, right.loc),
            };
        }
        return left;
    }

    private equality(): Expression {
        let left = this.comparison();

        while (this.match(TokenType.Equal, TokenType.NotEqual)) {
            const operator =
                this.previous().type === TokenType.Equal ? "==" : "!=";
            const right = this.comparison();
            left = {
                type: "BinaryExpression",
                operator: operator as "==" | "!=",
                left,
                right,
                loc: this.mergeLoc(left.loc, right.loc),
            };
        }
        return left;
    }

    private comparison(): Expression {
        let left = this.term();

        while (
            this.match(
                TokenType.Greater,
                TokenType.GreaterEqual,
                TokenType.Less,
                TokenType.LessEqual,
            )
        ) {
            const token = this.previous();
            let operator: ">" | ">=" | "<" | "<=";
            switch (token.type) {
                case TokenType.Greater:
                    operator = ">";
                    break;
                case TokenType.GreaterEqual:
                    operator = ">=";
                    break;
                case TokenType.Less:
                    operator = "<";
                    break;
                case TokenType.LessEqual:
                    operator = "<=";
                    break;
                default:
                    throw new Error("Unreachable");
            }
            const right = this.term();
            left = {
                type: "BinaryExpression",
                operator,
                left,
                right,
                loc: this.mergeLoc(left.loc, right.loc),
            };
        }
        return left;
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
            const typeInfo = this.parseType("Expected type for conversion");

            if (typeInfo.type === "void") {
                // Error handled by logic or check here?
                // parseType returns void if matched.
                // We should throw if void.
                // But parseType doesn't consume 'void' if it's not in TYPE_TOKENS?
                // Void is in TYPE_TOKENS? Yes.
                throw makeError(
                    this.source,
                    typeInfo.loc,
                    "Cannot convert to 'void'",
                );
            }

            left = {
                type: "TypeConversionExpression",
                value: left,
                targetType: typeInfo.type as VariableType,
                loc: this.mergeLoc(left.loc, typeInfo.loc),
            };
        }
        return left;
    }

    private unary(): Expression {
        // ! Operator
        if (this.match(TokenType.Bang)) {
            const operatorToken = this.previous();
            const right = this.unary();
            return {
                type: "UnaryExpression",
                operator: "!",
                value: right,
                loc: this.mergeLoc(this.getLoc(operatorToken), right.loc),
            };
        }

        // ++/-- Operators
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

        // typeof Operator
        if (this.match(TokenType.Typeof)) {
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
        let expr = this.primary();

        while (true) {
            if (this.match(TokenType.LParen)) {
                expr = this.finishCall(expr);
            } else if (this.match(TokenType.Dot)) {
                const nameToken = this.consume(
                    TokenType.Identifier,
                    "Expected property name after '.'",
                );
                expr = {
                    type: "MemberExpression",
                    object: expr,
                    property: nameToken.value,
                    loc: this.mergeLoc(expr.loc, this.getLoc(nameToken)),
                };
            } else if (this.match(TokenType.LBracket)) {
                const index = this.expression();
                const endToken = this.consume(
                    TokenType.RBracket,
                    "Expected ']' after index",
                );
                expr = {
                    type: "IndexExpression",
                    object: expr,
                    index: index,
                    loc: this.mergeLoc(expr.loc, this.getLoc(endToken)),
                };
            } else if (this.match(TokenType.PlusPlus, TokenType.MinusMinus)) {
                const operatorToken = this.previous();
                const operator =
                    operatorToken.type === TokenType.PlusPlus ? "++" : "--";

                if (
                    expr.type !== "VarReference" &&
                    expr.type !== "MemberExpression"
                ) {
                    throw this.error(
                        operatorToken,
                        "Invalid left-hand side expression in postfix operation",
                    );
                }

                expr = {
                    type: "UpdateExpression",
                    operator,
                    varName:
                        expr.type === "VarReference" ? expr.varName : "unknown", // UpdateExpression needs refactor or Interpreter needs change.
                    // Wait, UpdateExpression definition has varName: string. It supports ONLY VarReference currently?
                    // "object.field++" requires MemberExpression support in UpdateExpression.
                    // The AST definition for UpdateExpression has `varName: string`.
                    // To support `obj.field++`, I need to update UpdateExpression ID to support Expression or MemberExpression?
                    // OR I can defer `obj.field++` support and throw error if not VarReference.
                    // User request is "accessing deep properties via syntax like object.deep.field".
                    // Does NOT explicitly ask for mutating them via ++/--.
                    // I will RESTRICT ++/-- to VarReference for now to avoid cascading changes to UpdateExpression type.
                    prefix: false,
                    loc: this.mergeLoc(expr.loc, this.getLoc(operatorToken)),
                };

                // Re-validating restriction inside the loop block above:
                if (expr.type !== "UpdateExpression") {
                    // Should be UpdateExpression now, so check expr beforeassignment
                    // wait, the block above constructs UpdateExpression.
                    // CHECK: types/expression.ts UpdateExpression takes varName: string.
                    // So I CANNOT assign MemberExpression to it.
                    // So I must stick to:
                }
            } else {
                break;
            }
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
            return {
                type: "VarReference",
                varName: token.value,
                loc: this.getLoc(token),
            };
        }

        if (this.match(TokenType.TypeFunc)) {
            // func (params): type { ... }
            const startToken = this.previous();
            return this.parseLambdaBody(this.getLoc(startToken));
        }

        if (
            this.match(
                TokenType.TypeStr,
                TokenType.TypeObj,
                TokenType.TypeInt,
                TokenType.TypeDbl,
                TokenType.TypeBool,
                TokenType.TypeArray,
            )
        ) {
            const name = this.previous().value;
            // Treat as VarReference (to built-in functions)
            return {
                type: "VarReference",
                varName: name,
                loc: this.getLoc(this.previous()),
            };
        }

        if (this.check(TokenType.LAngle)) {
            return this.runtimeLiteral();
        }

        if (this.check(TokenType.LParen)) {
            return this.handleLParen();
        }

        // Array Literal: [ ... ]
        if (this.match(TokenType.LBracket)) {
            const startToken = this.previous();
            const elements: Expression[] = [];
            if (!this.check(TokenType.RBracket)) {
                do {
                    elements.push(this.expression());
                } while (this.match(TokenType.Comma));
            }
            const endToken = this.consume(
                TokenType.RBracket,
                "Expected ']' after array elements",
            );
            return {
                type: "ArrayLiteral",
                elements,
                loc: this.mergeLoc(
                    this.getLoc(startToken),
                    this.getLoc(endToken),
                ),
            };
        }

        // Object Literal: { key = val, ... }
        // Ambiguity with BlockStatement? No, because primary() is expression context.
        // { ... } in expression must be object.
        if (this.match(TokenType.LBrace)) {
            const startToken = this.previous();
            const properties: Record<string, Expression> = {};
            if (!this.check(TokenType.RBrace)) {
                do {
                    // key = val
                    const keyToken = this.consume(
                        TokenType.Identifier,
                        "Expected object key",
                    );
                    this.consume(
                        TokenType.Equals,
                        "Expected '=' after object key",
                    );
                    const value = this.expression();
                    properties[keyToken.value] = value;
                } while (this.match(TokenType.Comma));
            }
            const endToken = this.consume(
                TokenType.RBrace,
                "Expected '}' after object properties",
            );
            return {
                type: "ObjectLiteral",
                properties,
                loc: this.mergeLoc(
                    this.getLoc(startToken),
                    this.getLoc(endToken),
                ),
            };
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

    private finishCall(callee: Expression): CallExpression {
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
            loc: this.mergeLoc(callee.loc, this.getLoc(endToken)),
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
                const typeInfo = this.parseType("Expected parameter type");
                const paramName = this.consume(
                    TokenType.Identifier,
                    "Expected parameter name",
                );
                // typeInfo.type is already the resolved string (e.g. "int" or "array<int>")
                if (typeInfo.type === "void") {
                    throw this.error(paramName, "Parameter cannot be 'void'");
                }
                params.push({
                    name: paramName.value,
                    type: typeInfo.type as VariableType,
                });
            } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RParen, "Expected ')' after parameters");

        // Return Type
        this.consume(TokenType.Colon, "Expected ':' before return type");
        const returnTypeInfo = this.parseType("Expected return type");
        const returnType = returnTypeInfo.type;

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
            returnType: returnType as FunctionReturnType,
            body,
            loc: this.mergeLoc(this.getLoc(startParen), endLoc),
        };
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();

        if (
            this.peek().type === TokenType.Identifier &&
            this.previous().type === TokenType.Identifier
        ) {
            throw this.error(
                this.previous(),
                `Unknown keyword or identifier "${this.previous().value}"`,
            );
        }

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
        return makeError(this.source, this.getLoc(token), message);
    }
}
