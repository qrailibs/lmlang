import chalk from "chalk";
import { packages } from "@lmlang/library";
import { AST } from "../parser/types";
import {
    Expression,
    RuntimeLiteral,
    TypeCheckExpression,
    TypeConversionExpression,
} from "../parser/expressions";
import {
    Statement,
    DefStatement,
    ImportStatement,
    ExpressionStatement,
} from "../parser/statements";
import { Orchestrator } from "../orchestrator/Orchestrator";
import { Context } from "./Context";

export class Interpreter {
    private context: Context = new Context();
    private orchestrator?: Orchestrator;

    constructor(orchestrator?: Orchestrator) {
        this.orchestrator = orchestrator;
        this.initializeBuiltins();
    }

    private initializeBuiltins() {
        this.context.set("str", {
            type: "func",
            value: (arg: RuntimeValue) => ({
                type: "str",
                value: String(arg.value),
            }),
        });
        this.context.set("int", {
            type: "func",
            value: (arg: RuntimeValue) => ({
                type: "int",
                value: Math.floor(Number(arg.value)),
            }),
        });
        this.context.set("double", {
            type: "func",
            value: (arg: RuntimeValue) => ({
                type: "double",
                value: Number(arg.value),
            }),
        });
    }

    public async run(ast: AST): Promise<void> {
        for (const statement of ast.statements) {
            await this.executeStatement(statement);
        }
    }

    private async executeStatement(stmt: Statement): Promise<void> {
        try {
            if (stmt.kind === "DefStatement") {
                const defStmt = stmt as DefStatement;
                const value = await this.evaluateExpression(defStmt.value);

                // Strict assignment check
                // Allow assignment if value is 'unknown' (runtime literal result)
                if (
                    value.type !== "unknown" &&
                    defStmt.varType !== value.type
                ) {
                    if (defStmt.varType === "dbl" && value.type === "int") {
                        throw this.makeError(
                            stmt,
                            `Type Mismatch: Cannot assign '${value.type}' to '${defStmt.varType}'. Use double() conversion.`,
                        );
                    }

                    throw this.makeError(
                        stmt,
                        `Type Mismatch: Expected '${defStmt.varType}', got '${value.type}'`,
                    );
                }

                this.context.set(defStmt.name, value);
                return;
            }

            if (stmt.kind === "ImportStatement") {
                const importStmt = stmt as ImportStatement;
                if (packages[importStmt.moduleName]) {
                    const pkg = packages[importStmt.moduleName];
                    for (const imp of importStmt.imports) {
                        const exportName = imp.name;
                        const varName = imp.alias || imp.name;

                        if (pkg[exportName]) {
                            this.context.set(
                                varName,
                                this.wrap(pkg[exportName]),
                            );
                        } else {
                            console.warn(
                                `[Interpreter] Export '${exportName}' not found in module '${importStmt.moduleName}'`,
                            );
                        }
                    }
                } else {
                    console.log(
                        `[Interpreter] Imported unknown module ${importStmt.moduleName} (mocked)`,
                    );
                }
                return;
            }

            if (stmt.kind === "ExpressionStatement") {
                const exprStmt = stmt as ExpressionStatement;
                await this.evaluateExpression(exprStmt.expression);
                return;
            }

            throw new Error(
                `Unknown statement type: ${(stmt as any).kind || stmt.constructor.name}`,
            );
        } catch (e: any) {
            if (e.message.startsWith("[Line")) {
                throw e;
            }
            throw this.makeError(stmt, e.message);
        }
    }

    private async evaluateExpression(expr: Expression): Promise<RuntimeValue> {
        try {
            if (expr.type === "StringLiteral") {
                return { type: "str", value: expr.value };
            }
            if (expr.type === "IntLiteral") {
                return { type: "int", value: expr.value };
            }
            if (expr.type === "DoubleLiteral") {
                return { type: "dbl", value: expr.value };
            }
            if (expr.type === "BoolLiteral") {
                return { type: "bool", value: expr.value };
            }
            if (expr.type === "VarReference") {
                const val = this.context.get(expr.varName);
                if (!val)
                    throw new Error(`Variable '${expr.varName}' not found`);
                return val as RuntimeValue;
            }
            if (expr.type === "RuntimeLiteral") {
                return this.executeRuntimeLiteral(expr);
            }
            if (expr.type === "TypeConversionExpression") {
                return this.evaluateTypeConversion(expr);
            }
            if (expr.type === "TypeCheckExpression") {
                return this.evaluateTypecheck(expr);
            }
            if (expr.type === "BinaryExpression") {
                return await this.evaluateBinaryExpression(expr);
            }
            if (expr.type === "CallExpression") {
                const funcWrapper = this.context.get(
                    expr.callee,
                ) as RuntimeValue;
                if (!funcWrapper || funcWrapper.type !== "func") {
                    throw new Error(
                        `'${expr.callee}' is not a function. It is ${funcWrapper?.type}`,
                    );
                }
                const args = [];
                for (const argExpr of expr.arguments) {
                    const res = await this.evaluateExpression(argExpr);
                    args.push(this.unwrap(res)); // Unwrap for function calls
                }
                return await (funcWrapper.value as Function)(...args);
            }
            throw new Error(`Unknown expression type: ${(expr as any).type}`);
        } catch (e: any) {
            if (e.message.startsWith("[Line")) {
                throw e;
            }
            throw this.makeError(expr, e.message);
        }
    }

    private async evaluateTypeConversion(
        expr: TypeConversionExpression,
    ): Promise<RuntimeValue> {
        const { value } = await this.evaluateExpression(expr.value);

        return { type: expr.targetType, value };
    }

    private async evaluateTypecheck(
        expr: TypeCheckExpression,
    ): Promise<RuntimeValue> {
        const { type } = await this.evaluateExpression(expr.value);

        return { type: "str", value: type };
    }

    private async evaluateBinaryExpression(expr: any): Promise<RuntimeValue> {
        const left = await this.evaluateExpression(expr.left);
        const right = await this.evaluateExpression(expr.right);

        // Allow operations if one side is 'unknown'
        if (left.type !== right.type) {
            if (left.type !== "unknown" && right.type !== "unknown") {
                throw new Error(
                    `Type Mismatch during operation '${expr.operator}': Cannot operate on '${left.type}' and '${right.type}'. Convert types first.`,
                );
            }
        }

        const type =
            left.type === "unknown" || right.type === "unknown"
                ? "unknown"
                : left.type;
        const lVal = left.value;
        const rVal = right.value;

        // If unknown, try to apply operator in JS style
        if (type === "unknown") {
            let result: any;
            switch (expr.operator) {
                case "+":
                    result = lVal + rVal;
                    break;
                case "-":
                    result = lVal - rVal;
                    break;
                case "*":
                    result = lVal * rVal;
                    break;
                case "/":
                    result = lVal / rVal;
                    break;
                default:
                    throw new Error(`Unknown operator ${expr.operator}`);
            }
            return this.wrap(result);
        }

        if (type === "int" || type === "dbl") {
            let result: number;
            switch (expr.operator) {
                case "+":
                    result = lVal + rVal;
                    break;
                case "-":
                    result = lVal - rVal;
                    break;
                case "*":
                    result = lVal * rVal;
                    break;
                case "/":
                    // Always return double for division to capture decimals
                    result = lVal / rVal;
                    break;
                default:
                    throw new Error(`Unknown operator ${expr.operator}`);
            }

            // Determine result type
            if (type === "dbl") return { type: "dbl", value: result };
            // For int inputs
            if (Number.isInteger(result)) return { type: "int", value: result };
            return { type: "dbl", value: result };
        }

        if (type === "str") {
            if (expr.operator === "+") {
                return { type: "str", value: lVal + rVal };
            }
            throw new Error("Strings only support addition.");
        }

        if (type === "obj") {
            if (expr.operator === "+") {
                return { type: "obj", value: { ...lVal, ...rVal } };
            }
            throw new Error("Objects only support addition.");
        }

        throw new Error(
            `Operation '${expr.operator}' not supported for type '${type}'`,
        );
    }

    private async executeRuntimeLiteral(
        block: RuntimeLiteral,
    ): Promise<RuntimeValue> {
        const runtimeRef = this.context.get(block.runtimeName);
        const actualRuntimeName = (
            runtimeRef ? runtimeRef.value : block.runtimeName
        ) as string;

        if (!this.orchestrator) {
            console.warn(
                chalk.yellow(
                    "[Interpreter] No Orchestrator attached. Skipping execution.",
                ),
            );

            // Return nothing
            return { type: "nil", value: undefined };
        }

        // Pass context into runtime
        const ctx: Record<string, unknown> = {};
        for (const [key, valExpr] of Object.entries(block.attributes || {})) {
            const res = await this.evaluateExpression(valExpr as Expression);
            ctx[key] = this.unwrap(res); // Unwrap for external runtime
        }

        // Execute code inside container, via orchestrator
        const result = await this.orchestrator.execute(
            actualRuntimeName,
            block.code,
            ctx,
        );

        // Return as unknown for now
        // TODO: auto-detect type in cases where possible
        return { type: "unknown", value: result };
    }

    private wrap(val: any): RuntimeValue {
        if (val === null || val === undefined)
            return { type: "nil", value: null };
        if (typeof val === "number") {
            return Number.isInteger(val)
                ? { type: "int", value: val }
                : { type: "dbl", value: val };
        }
        if (typeof val === "string") return { type: "str", value: val };
        if (typeof val === "boolean") return { type: "bool", value: val };
        if (typeof val === "function") return { type: "func", value: val };
        if (val instanceof Error) return { type: "err", value: val };
        return { type: "unknown", value: val };
    }

    private unwrap(val: RuntimeValue): any {
        return val.value;
    }

    private makeError(node: Statement | Expression, message: string): Error {
        const { loc } = node;
        if (loc) {
            return new Error(`[Line ${loc.line}, Col ${loc.col}] ${message}`);
        }
        return new Error(message);
    }
}

export type RuntimeValue =
    | { type: "str"; value: string }
    | { type: "int"; value: number }
    | { type: "dbl"; value: number }
    | { type: "bool"; value: boolean }
    | { type: "obj"; value: any }
    | { type: "nil"; value: null | undefined }
    | { type: "func"; value: Function }
    | { type: "unknown"; value: unknown }
    | { type: "err"; value: unknown };
