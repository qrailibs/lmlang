import { packages } from "@lmlang/library";
import { AST, VariableType, FunctionReturnType } from "../parser/types";
import {
    Statement,
    DefStatement,
    ExpressionStatement,
    AssignmentStatement,
} from "../parser/statements";
import { Expression } from "../parser/expressions";
import { makeError, LmlangError } from "../utils/Error";

import { FunctionSignature } from "@lmlang/library/dist/types";

interface ScanContext {
    vars: Map<string, VariableType>;
    signatures: Map<string, FunctionSignature>;
    parent?: ScanContext;
    expectedReturnType?: FunctionReturnType;
}

export interface ScannerResult {
    errors: LmlangError[];
}

export class Scanner {
    private source: string;
    private errors: LmlangError[] = [];
    private globalContext: ScanContext = {
        vars: new Map(),
        signatures: new Map(),
    };

    constructor(source: string) {
        this.source = source;
        this.initializeBuiltins();
    }

    private initializeBuiltins() {
        // Builtin functions
        this.globalContext.vars.set("str", "func");
        this.globalContext.vars.set("int", "func");
        this.globalContext.vars.set("double", "func");
        // Add other builtins if needed
    }

    public scan(ast: AST): ScannerResult {
        this.errors = [];
        // Use a fresh context for each scan (resets vars)
        this.globalContext = { vars: new Map(), signatures: new Map() };
        this.initializeBuiltins();

        for (const stmt of ast.statements) {
            try {
                this.scanStatement(stmt, this.globalContext);
            } catch (e: any) {
                if (e.name === "LmlangError" || e instanceof LmlangError) {
                    this.errors.push(e);
                } else {
                    // Fallback for unknown errors
                    // Try to extract location if possible from parser error pattern or default to 0,0
                    // But assume it's just a message if generic
                    this.errors.push(
                        makeError(
                            this.source,
                            { line: 0, col: 0 },
                            e.message || String(e),
                        ),
                    );
                }
            }
        }
        return { errors: this.errors };
    }

    private scanStatement(stmt: Statement, ctx: ScanContext) {
        if (stmt.kind === "DefStatement") {
            const defStmt = stmt as DefStatement;
            const exprType = this.inferExpressionType(defStmt.value, ctx);

            // Type check assignment
            // Allow assignment if expression type is 'unknown' (e.g. from runtime literal or complex expression)
            // But if both are known, they must match.
            if (exprType !== "unknown" && defStmt.varType !== exprType) {
                // Check specific allowed conversions or mismatches
                if (defStmt.varType === "dbl" && exprType === "int") {
                    throw makeError(
                        this.source,
                        defStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Cannot assign '${exprType}' to '${defStmt.varType}'`,
                        "Use double() conversion function.",
                    );
                }

                throw makeError(
                    this.source,
                    defStmt.loc || { line: 0, col: 0 },
                    `Type Mismatch: Expected '${defStmt.varType}', got '${exprType}'`,
                );
            }

            // Register variable
            ctx.vars.set(defStmt.name, defStmt.varType);
            return;
        }

        if (stmt.kind === "AssignmentStatement") {
            const assignStmt = stmt as AssignmentStatement;
            const targetType = this.lookupVar(assignStmt.name, ctx);

            if (!targetType) {
                throw makeError(
                    this.source,
                    assignStmt.loc || { line: 0, col: 0 },
                    `Variable '${assignStmt.name}' not found`,
                );
            }

            const valueType = this.inferExpressionType(assignStmt.value, ctx);

            if (
                targetType !== "unknown" &&
                valueType !== "unknown" &&
                targetType !== valueType
            ) {
                // Allow int to dbl assignment?
                if (targetType === "dbl" && valueType === "int") {
                    throw makeError(
                        this.source,
                        assignStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Cannot assign '${valueType}' to '${targetType}'`,
                        "Use double() conversion or ensure value is double.",
                    );
                }
                throw makeError(
                    this.source,
                    assignStmt.loc || { line: 0, col: 0 },
                    `Type Mismatch: Cannot assign '${valueType}' to '${targetType}'`,
                );
            }
            return;
        }

        if (stmt.kind === "ExpressionStatement") {
            this.inferExpressionType(
                (stmt as ExpressionStatement).expression,
                ctx,
            );
            return;
        }

        if (stmt.kind === "ImportStatement") {
            // For static analysis of imports, we might need to know what they export.
            // For now, we assume imported things are 'unknown' or just register them if we can't resolve.
            // The current Interpreter mocks imports if not found.
            // We can register them as 'unknown' types in context.
            // Register imports
            const impStmt = stmt as any;
            if (packages[impStmt.moduleName]) {
                const pkg = packages[impStmt.moduleName];
                for (const imp of impStmt.imports) {
                    const exportName = imp.name;
                    const varName = imp.alias || imp.name;

                    if (pkg[exportName]) {
                        ctx.vars.set(varName, "func"); // Mostly functions
                        // Store signature if available
                        if (pkg[exportName].signature) {
                            ctx.signatures.set(
                                varName,
                                pkg[exportName].signature,
                            );
                        }
                    } else {
                        throw makeError(
                            this.source,
                            impStmt.loc || { line: 0, col: 0 },
                            `Export '${exportName}' not found in module '${impStmt.moduleName}'`,
                        );
                    }
                }
            } else {
                throw makeError(
                    this.source,
                    impStmt.loc || { line: 0, col: 0 },
                    `Module '${impStmt.moduleName}' not found`,
                );
            }
            return;
        }

        if (stmt.kind === "BlockStatement") {
            const blockCtx: ScanContext = {
                vars: new Map(),
                signatures: new Map(),
                parent: ctx,
                expectedReturnType: ctx.expectedReturnType,
            };
            for (const s of (stmt as any).statements) {
                // CAST: BlockStatement
                this.scanStatement(s, blockCtx);
            }
            return;
        }

        if (stmt.kind === "ReturnStatement") {
            const retStmt = stmt as any; // Cast ReturnStatement
            // Check if return has value
            if (retStmt.value) {
                const exprType = this.inferExpressionType(retStmt.value, ctx);

                if (
                    ctx.expectedReturnType &&
                    ctx.expectedReturnType !== "unknown"
                ) {
                    if (ctx.expectedReturnType === "void") {
                        throw makeError(
                            this.source,
                            retStmt.loc || { line: 0, col: 0 },
                            `Void function cannot return a value`,
                        );
                    }

                    if (
                        exprType !== "unknown" &&
                        exprType !== ctx.expectedReturnType
                    ) {
                        throw makeError(
                            this.source,
                            retStmt.loc || { line: 0, col: 0 },
                            `Invalid Return Type: Expected '${ctx.expectedReturnType}', got '${exprType}'`,
                        );
                    }
                }
            } else {
                // No value returned
                if (
                    ctx.expectedReturnType &&
                    ctx.expectedReturnType !== "unknown" &&
                    ctx.expectedReturnType !== "void"
                ) {
                    throw makeError(
                        this.source,
                        retStmt.loc || { line: 0, col: 0 },
                        `Expected return value of type '${ctx.expectedReturnType}'`,
                    );
                }
            }

            return;
        }
    }

    private inferExpressionType(
        expr: Expression,
        ctx: ScanContext,
    ): VariableType {
        if (expr.type === "StringLiteral") return "str";
        if (expr.type === "IntLiteral") return "int";
        if (expr.type === "DoubleLiteral") return "dbl";
        if (expr.type === "BoolLiteral") return "bool";

        if (expr.type === "VarReference") {
            const type = this.lookupVar(expr.varName, ctx);
            if (!type) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Variable '${expr.varName}' not found`,
                );
            }
            return type;
        }

        if (expr.type === "BinaryExpression") {
            const leftType = this.inferExpressionType(expr.left, ctx);
            const rightType = this.inferExpressionType(expr.right, ctx);

            if (leftType === "unknown" || rightType === "unknown")
                return "unknown";

            if (leftType !== rightType) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Binary Operation Type Mismatch: '${leftType}' vs '${rightType}'`,
                );
            }

            // Define return types for operators
            if (["+", "-", "*", "/"].includes(expr.operator)) {
                if (leftType === "int" || leftType === "dbl") {
                    // Division always returns double in this language?
                    // Interpreter says: result = lVal / rVal (always double-ish equivalent in JS numbers)
                    // Interpreter: if (type === "dbl") return "dbl"; if int and result is int -> int.
                    // Static analysis: can't know if result is int for division.
                    // Let's assume arithmetic on int produces int unless division?
                    if (expr.operator === "/") return "dbl";
                    return leftType;
                }
                if (leftType === "str" && expr.operator === "+") {
                    return "str";
                }

                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Operator '${expr.operator}' not supported for type '${leftType}'`,
                );
            }
        }

        if (expr.type === "CallExpression") {
            // Check callee
            const calleeType = this.lookupVar(expr.callee, ctx);
            if (!calleeType) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Function '${expr.callee}' not found`,
                );
            }
            if (calleeType !== "func" && calleeType !== "unknown") {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `'${expr.callee}' is not a function. It is '${calleeType}'`,
                );
            }

            // Check args and signature
            const signature = this.lookupSignature(expr.callee, ctx);

            if (signature) {
                // Verify arg count
                // Handle rest parameters (starting with ...)
                const hasRest = signature.params.some((p) =>
                    p.name.startsWith("..."),
                );

                // Filter out optional arguments for min count check
                const requiredParams = signature.params.filter(
                    (p) => !p.name.endsWith("?") && !p.name.startsWith("..."),
                );

                if (!hasRest) {
                    if (expr.arguments.length > signature.params.length) {
                        throw makeError(
                            this.source,
                            expr.loc || { line: 0, col: 0 },
                            `Too many arguments. Expected ${signature.params.length}, got ${expr.arguments.length}`,
                        );
                    }
                    if (expr.arguments.length < requiredParams.length) {
                        throw makeError(
                            this.source,
                            expr.loc || { line: 0, col: 0 },
                            `Too few arguments. Expected at least ${requiredParams.length}, got ${expr.arguments.length}`,
                        );
                    }
                }

                // Verify arg types
                for (let i = 0; i < expr.arguments.length; i++) {
                    const argType = this.inferExpressionType(
                        expr.arguments[i],
                        ctx,
                    );

                    // Determine expected param
                    let param = signature.params[i];
                    if (!param && hasRest) {
                        // Use the rest param
                        param = signature.params[signature.params.length - 1];
                    }

                    if (param) {
                        // Skip check for 'unknown' param type (like in print)
                        if (param.type !== "unknown" && argType !== "unknown") {
                            if (argType !== param.type) {
                                throw makeError(
                                    this.source,
                                    expr.arguments[i].loc || {
                                        line: 0,
                                        col: 0,
                                    },
                                    `Argument Type Mismatch: Expected '${param.type}', got '${argType}'`,
                                );
                            }
                        }
                    }
                }

                // Return known return type
                return (signature.returnType as VariableType) || "unknown";
            } else {
                // No signature, just infer args
                for (const arg of expr.arguments) {
                    this.inferExpressionType(arg, ctx);
                }
            }

            // Return type of function call?
            // Since we don't have function signatures yet, we have to assume 'unknown'
            // OR checks built-ins.
            if (expr.callee === "str") return "str";
            if (expr.callee === "int") return "int";
            if (expr.callee === "double") return "dbl";

            return "unknown";
        }

        if (expr.type === "TypeConversionExpression") {
            // Recursive check
            this.inferExpressionType(expr.value, ctx);
            return expr.targetType;
        }

        if (expr.type === "UpdateExpression") {
            const type = this.lookupVar(expr.varName, ctx);
            if (!type) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Variable '${expr.varName}' not found`,
                );
            }
            if (type !== "int" && type !== "dbl" && type !== "unknown") {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Cannot perform '${expr.operator}' on type '${type}'`,
                );
            }
            return type;
        }

        if (expr.type === "TypeCheckExpression") {
            this.inferExpressionType(expr.value, ctx);
            return "str"; // type check returns string name of type
        }

        if (expr.type === "RuntimeLiteral") {
            // Check attributes
            if (expr.attributes) {
                for (const val of Object.values(expr.attributes)) {
                    this.inferExpressionType(val, ctx);
                }
            }
            return "unknown"; // runtime result is unknown
        }

        if (expr.type === "LambdaExpression") {
            // (params) : type => body
            const lambda = expr as any; // LambdaExpression

            // Create scope for lambda
            const lambdaCtx: ScanContext = {
                vars: new Map(),
                signatures: new Map(),
                parent: ctx,
                expectedReturnType: lambda.returnType,
            };

            // Register params
            for (const param of lambda.params) {
                lambdaCtx.vars.set(param.name, param.type);
            }

            // check body
            if (lambda.body) {
                if (Array.isArray(lambda.body)) {
                    // Block body
                    let hasReturn = false;

                    // Simple recursive check for return statement
                    const checkReturns = (stmts: Statement[]): boolean => {
                        for (const s of stmts) {
                            if (s.kind === "ReturnStatement") return true;
                            if (s.kind === "BlockStatement") {
                                if (checkReturns((s as any).statements))
                                    return true;
                            }
                        }
                        return false;
                    };

                    hasReturn = checkReturns(lambda.body);

                    for (const s of lambda.body) {
                        this.scanStatement(s, lambdaCtx);
                    }

                    if (
                        lambda.returnType !== "void" &&
                        lambda.returnType !== "unknown" &&
                        !hasReturn
                    ) {
                        throw makeError(
                            this.source,
                            lambda.loc || { line: 0, col: 0 },
                            `Missing return statement in function expected to return '${lambda.returnType}'`,
                        );
                    }
                } else {
                    // Expression body
                    const bodyType = this.inferExpressionType(
                        lambda.body as Expression,
                        lambdaCtx,
                    );
                    if (
                        lambda.returnType !== "unknown" &&
                        bodyType !== "unknown"
                    ) {
                        if (lambda.returnType !== bodyType) {
                            throw makeError(
                                this.source,
                                lambda.loc || { line: 0, col: 0 },
                                `Lambda Return Type Mismatch: Expected '${lambda.returnType}', got '${bodyType}'`,
                            );
                        }
                    }
                }
            }

            return "func";
        }

        return "unknown";
    }

    private lookupVar(
        name: string,
        ctx: ScanContext,
    ): VariableType | undefined {
        if (ctx.vars.has(name)) return ctx.vars.get(name);
        if (ctx.parent) return this.lookupVar(name, ctx.parent);
        return undefined;
    }

    private lookupSignature(
        name: string,
        ctx: ScanContext,
    ): FunctionSignature | undefined {
        if (ctx.signatures.has(name)) return ctx.signatures.get(name);
        if (ctx.parent) return this.lookupSignature(name, ctx.parent);
        return undefined;
    }
    public getScopeAt(
        ast: AST,
        loc: { line: number; col: number },
    ): ScanContext {
        // Find deepest node
        // Actually, we just need to traverse and stop at the deepest scope containing the loc.
        // Or simpler: use similar logic to findNodeStack but for SCOPE.
        // But we need the ScanContext populated.
        // So we must "run" the scan up to that point.

        let ctx = this.globalContext;
        this.globalContext = { vars: new Map(), signatures: new Map() };
        this.initializeBuiltins();
        ctx = this.globalContext;

        this.scanScope(ast.statements, ctx, loc);
        return this.deepestScope || ctx; // fall back to global
    }

    private deepestScope: ScanContext | undefined;

    private scanScope(
        statements: Statement[],
        ctx: ScanContext,
        targetLoc: { line: number; col: number },
    ) {
        // If current scope contains loc, this might be the one, unless we go deeper.
        // We track the "deepest" valid scope found so far.
        // Actually, scanScope is called when we ARE in a scope that definitely overlaps (or is global).
        this.deepestScope = ctx;

        for (const stmt of statements) {
            // Process declarations to populate ctx
            if (stmt.kind === "DefStatement") {
                const defStmt = stmt as DefStatement;
                ctx.vars.set(defStmt.name, defStmt.varType);
            } else if (stmt.kind === "AssignmentStatement") {
                // assignment doesn't create vars
            } else if (stmt.kind === "ImportStatement") {
                // Register imports
                const impStmt = stmt as any;
                if (packages[impStmt.moduleName]) {
                    const pkg = packages[impStmt.moduleName];
                    for (const imp of impStmt.imports) {
                        const exportName = imp.name;
                        const varName = imp.alias || imp.name;
                        if (pkg[exportName]) {
                            ctx.vars.set(varName, "func");
                            if (pkg[exportName].signature) {
                                ctx.signatures.set(
                                    varName,
                                    pkg[exportName].signature,
                                );
                            }
                        }
                    }
                }
            }

            // Check if we should dive into this statement
            if (this.contains(stmt, targetLoc)) {
                if (stmt.kind === "BlockStatement") {
                    const blockCtx: ScanContext = {
                        vars: new Map(),
                        signatures: new Map(),
                        parent: ctx,
                        expectedReturnType: ctx.expectedReturnType,
                    };
                    this.scanScope(
                        (stmt as any).statements,
                        blockCtx,
                        targetLoc,
                    );
                    return; // Found our path, no need to check other statements in this scope
                } else if (stmt.kind === "DefStatement") {
                    // Check value if lambda/block?
                    const def = stmt as DefStatement;
                    this.scanScopeExpression(def.value, ctx, targetLoc);
                } else if (stmt.kind === "ExpressionStatement") {
                    this.scanScopeExpression(
                        (stmt as ExpressionStatement).expression,
                        ctx,
                        targetLoc,
                    );
                } else if (stmt.kind === "ReturnStatement") {
                    const ret = stmt as any;
                    if (ret.value)
                        this.scanScopeExpression(ret.value, ctx, targetLoc);
                }
            }
        }
    }

    private scanScopeExpression(
        expr: Expression,
        ctx: ScanContext,
        loc: { line: number; col: number },
    ) {
        if (!this.contains(expr, loc)) return;

        if (expr.type === "LambdaExpression") {
            // Enter lambda scope
            const lambda = expr as any; // LambdaExpression
            const lambdaCtx: ScanContext = {
                vars: new Map(),
                signatures: new Map(),
                parent: ctx,
                expectedReturnType: lambda.returnType,
            };
            // Register params
            for (const param of lambda.params) {
                lambdaCtx.vars.set(param.name, param.type);
            }
            this.deepestScope = lambdaCtx;

            if (lambda.body) {
                if (Array.isArray(lambda.body)) {
                    this.scanScope(lambda.body, lambdaCtx, loc);
                } else {
                    this.scanScopeExpression(
                        lambda.body as Expression,
                        lambdaCtx,
                        loc,
                    );
                }
            }
            return;
        }

        // Other expressions that contain children?
        if (expr.type === "BinaryExpression") {
            // dive
            if (this.contains(expr.left, loc))
                this.scanScopeExpression(expr.left, ctx, loc);
            if (this.contains(expr.right, loc))
                this.scanScopeExpression(expr.right, ctx, loc);
        } else if (expr.type === "CallExpression") {
            for (const arg of expr.arguments) {
                if (this.contains(arg, loc))
                    this.scanScopeExpression(arg, ctx, loc);
            }
        } else if (expr.type === "TypeConversionExpression") {
            this.scanScopeExpression(expr.value, ctx, loc);
        } else if (expr.type === "TypeCheckExpression") {
            this.scanScopeExpression(expr.value, ctx, loc);
        }
    }

    private contains(
        node: {
            loc?: {
                line: number;
                col: number;
                endLine?: number;
                endCol?: number;
            };
        },
        loc: { line: number; col: number },
    ): boolean {
        if (!node.loc) return false;
        const startLine = node.loc.line;
        const startCol = node.loc.col;

        // Simple check: loc is after start.
        if (loc.line < startLine) return false;
        if (loc.line === startLine && loc.col < startCol) return false;

        // Check end if available or assume it contains if it starts before?
        // Ideally checking end is better.
        // Using same logic as ASTUtils
        const endLine =
            node.loc.endLine !== undefined ? node.loc.endLine : startLine; // Fallback? default to big?
        const endCol = node.loc.endCol !== undefined ? node.loc.endCol : 99999;

        if (loc.line > endLine) return false;
        if (loc.line === endLine && loc.col > endCol) return false;

        return true;
    }
    public getAvailableModules(): string[] {
        return Object.keys(packages);
    }

    public getModuleExports(
        moduleName: string,
    ): Record<string, any> | undefined {
        // Return exports of the package
        if (packages[moduleName]) {
            // We return the package object itself which contains the exports
            return packages[moduleName];
        }
        return undefined;
    }
}
