import { AST, VariableType } from "../parser/types";
import {
    Statement,
    DefStatement,
    ExpressionStatement,
} from "../parser/statements";
import { Expression } from "../parser/expressions";
import { makeError } from "../utils/Error";

interface ScanContext {
    vars: Map<string, VariableType>;
    parent?: ScanContext;
}

export class Scanner {
    private source: string;
    private errors: Error[] = [];
    private globalContext: ScanContext = { vars: new Map() };

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

    public scan(ast: AST): void {
        this.errors = [];
        // Reset context or use a fresh one for each scan?
        // Typically scan is one-shot.

        for (const stmt of ast.statements) {
            try {
                this.scanStatement(stmt, this.globalContext);
            } catch (e: any) {
                // If makeError was used, it throws an Error.
                // We can collect them or throw immediately.
                // The requirements said: "runs only if no errors during scan"
                // So we can collect multiple errors or throw first one.
                // Let's throw immediately for now as per "makeError" style which returns an Error object,
                // but usually we want to throw it.
                if (e instanceof Error) {
                    throw e;
                } else {
                    throw new Error(String(e));
                }
            }
        }
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
            const impStmt = stmt as any; // Cast to access fields
            if (impStmt.imports) {
                for (const imp of impStmt.imports) {
                    const varName = imp.alias || imp.name;
                    ctx.vars.set(varName, "unknown");
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

            // Check args
            for (const arg of expr.arguments) {
                this.inferExpressionType(arg, ctx);
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

        return "unknown";
    }

    private lookupVar(
        name: string,
        ctx: ScanContext,
    ): VariableType | undefined {
        // Simple scope lookup
        // Currently only global context is used in this simple implementation
        if (ctx.vars.has(name)) return ctx.vars.get(name);
        return undefined;
    }
}
