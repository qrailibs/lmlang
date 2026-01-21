import chalk from "chalk";
import { packages, RuntimeValue } from "@lmlang/library";
import { AST } from "../parser/types";
import {
    Expression,
    RuntimeLiteral,
    TypeCheckExpression,
    TypeConversionExpression,
    UpdateExpression,
} from "../parser/expressions";
import {
    Statement,
    DefStatement,
    ImportStatement,
    ExpressionStatement,
    AssignmentStatement,
} from "../parser/statements";
import { Orchestrator } from "../orchestrator/Orchestrator";
import { Context } from "./Context";
import { makeError } from "../utils/Error";

class ReturnSignal {
    constructor(public value: RuntimeValue) {}
}

export class Interpreter {
    private context: Context = new Context();
    private orchestrator?: Orchestrator;
    private source: string = "";

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

    public async run(ast: AST, source: string): Promise<void> {
        this.source = source;
        for (const statement of ast.statements) {
            await this.executeStatement(statement);
        }
    }

    public getVariable(name: string): RuntimeValue | undefined {
        return this.context.get(name);
    }

    private async executeStatement(stmt: Statement): Promise<void> {
        try {
            if (stmt.kind === "DefStatement") {
                const defStmt = stmt as DefStatement;
                const value = await this.evaluateExpression(defStmt.value);

                // Runtime type check (safety net, though Scanner should catch mostly)
                if (
                    value.type !== "unknown" &&
                    defStmt.varType !== value.type
                ) {
                    // Only check if types are definitely known and mismatching
                    // This creates a nice runtime error if something slipped through or was dynamic
                    if (defStmt.varType === "dbl" && value.type === "int") {
                        throw this.createError(
                            stmt,
                            `Runtime Type Mismatch: Cannot assign '${value.type}' to '${defStmt.varType}'.`,
                            "Use double() conversion.",
                        );
                    }

                    throw this.createError(
                        stmt,
                        `Runtime Type Mismatch: Expected '${defStmt.varType}', got '${value.type}'`,
                    );
                }

                // Register variable
                this.context.set(defStmt.name, value);
                return;
            }

            if (stmt.kind === "AssignmentStatement") {
                const assignStmt = stmt as AssignmentStatement;
                const value = await this.evaluateExpression(assignStmt.value);

                // Check current type compatibility
                const currentVal = this.context.get(assignStmt.name);
                if (currentVal) {
                    if (
                        value.type !== "unknown" &&
                        currentVal.type !== "unknown" &&
                        value.type !== currentVal.type
                    ) {
                        if (currentVal.type === "dbl" && value.type === "int") {
                            // Allow int to dbl conversion?
                            // If we want consistent runtime behavior with Def, we might enforce strictness or conversion.
                            // For now let's enforce what Scanner enforces.
                            // Scanner error message suggests: "Use double() conversion." so strict.
                            throw this.createError(
                                stmt,
                                `Runtime Type Mismatch: Cannot assign '${value.type}' to '${currentVal.type}'.`,
                            );
                        }
                        throw this.createError(
                            stmt,
                            `Runtime Type Mismatch: Expected '${currentVal.type}', got '${value.type}'`,
                        );
                    }
                }

                this.context.assign(assignStmt.name, value);
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

            if (stmt.kind === "ReturnStatement") {
                const retStmt = stmt as any; // Cast
                const value = await this.evaluateExpression(retStmt.value);
                throw new ReturnSignal(value);
            }

            if (stmt.kind === "BlockStatement") {
                const blockStmt = stmt as any; // Cast
                // Create new scope
                const parentCtx = this.context;
                this.context = new Context(parentCtx);
                try {
                    for (const s of blockStmt.statements) {
                        await this.executeStatement(s);
                    }
                } finally {
                    this.context = parentCtx; // Restore scope
                }
                return;
            }

            throw new Error(
                `Unknown statement type: ${(stmt as any).kind || stmt.constructor.name}`,
            );
            throw new Error(
                `Unknown statement type: ${(stmt as any).kind || stmt.constructor.name}`,
            );
        } catch (e: any) {
            if (e instanceof ReturnSignal) throw e; // Propagate return

            // Check if it's already a formatted error (starts with Error:)
            // Our makeError returns an Error object where message starts with newline+Color codes etc.
            // But standard Error might wrap it.
            if (
                e.message &&
                (e.message.includes("--> line") || e.message.startsWith("\n"))
            ) {
                throw e;
            }
            throw this.createError(stmt, e.message);
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
            if (expr.type === "UpdateExpression") {
                const currentVal = this.context.get(expr.varName);
                if (!currentVal)
                    throw new Error(`Variable '${expr.varName}' not found`);

                if (
                    currentVal.type !== "int" &&
                    currentVal.type !== "dbl" &&
                    currentVal.type !== "unknown"
                ) {
                    throw new Error(
                        `Cannot perform '${expr.operator}' on type '${currentVal.type}'`,
                    );
                }

                const numVal = Number(currentVal.value);
                const newVal = expr.operator === "++" ? numVal + 1 : numVal - 1;

                const resultVal: RuntimeValue = {
                    type:
                        currentVal.type === "unknown"
                            ? Number.isInteger(newVal)
                                ? "int"
                                : "dbl"
                            : currentVal.type,
                    value: newVal,
                };

                this.context.assign(expr.varName, resultVal);

                if (expr.prefix) {
                    return resultVal;
                } else {
                    return currentVal;
                }
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
                    args.push(res);
                }
                return await (funcWrapper.value as Function)(...args);
            }
            if (expr.type === "LambdaExpression") {
                const lambda = expr as any; // LambdaExpression
                const closureCtx = this.context; // Capture current scope

                const jsFunc = async (...args: any[]) => {
                    // Create function scope
                    const parentCtx = this.context;
                    this.context = new Context(closureCtx); // Use closure scope as parent

                    // Bind params
                    // Bind params
                    for (let i = 0; i < lambda.params.length; i++) {
                        const paramName = lambda.params[i].name;
                        this.context.set(paramName, args[i]);
                    }

                    try {
                        if (Array.isArray(lambda.body)) {
                            // Block body
                            for (const s of lambda.body) {
                                await this.executeStatement(s);
                            }
                            // If we fall off end of function without return
                            return { type: "nil", value: undefined };
                        } else {
                            // Expression body
                            const res = await this.evaluateExpression(
                                lambda.body,
                            );
                            return res;
                        }
                    } catch (e) {
                        if (e instanceof ReturnSignal) {
                            return e.value;
                        }
                        throw e;
                    } finally {
                        this.context = parentCtx;
                    }
                };

                return { type: "func", value: jsFunc };
            }
            throw new Error(`Unknown expression type: ${(expr as any).type}`);
        } catch (e: any) {
            if (
                e.message &&
                (e.message.includes("--> line") || e.message.startsWith("\n"))
            ) {
                throw e;
            }
            throw this.createError(expr, e.message);
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

    private createError(
        node: Statement | Expression,
        message: string,
        hint?: string,
    ): Error {
        const { loc } = node;
        if (loc) {
            return makeError(this.source, loc, message, hint);
        }
        // Fallback if no location
        return new Error(message);
    }
}
