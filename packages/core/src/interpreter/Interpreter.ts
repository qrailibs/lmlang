import chalk from "chalk";
import {
    packages,
    RuntimeValue,
    VariableType,
    ArrayType,
} from "@lmlang/library";

import { AST, Statement } from "../types/ast";
import {
    BinaryExpression,
    Expression,
    RuntimeLiteral,
    TypeCheckExpression,
    TypeConversionExpression,
} from "../types/expression";
import {
    DefStatement,
    ImportStatement,
    ExpressionStatement,
    AssignmentStatement,
    IfStatement,
} from "../parser/statements";
import { Lexer } from "../lexer/Lexer";
import { Parser } from "../parser/Parser";
import { Orchestrator } from "../orchestrator/Orchestrator";
import { makeError } from "../utils/err";
import {
    typeToString,
    typesMatch,
    validateTypeConversion,
} from "../utils/typesystem";
import { Context } from "./Context";

class ReturnSignal {
    constructor(public value: RuntimeValue) {}
}

export class Interpreter {
    public context: Context = new Context();
    private orchestrator?: Orchestrator;
    private source: string = "";

    // Module System
    private moduleLoader?: (path: string, base: string) => string | null;
    private currentFile: string;
    private moduleCache: Map<string, Interpreter> = new Map();
    public exportedNames: Set<string> = new Set();

    constructor(
        orchestrator?: Orchestrator,
        moduleLoader?: (path: string, base: string) => string | null,
        currentFile: string = ".",
    ) {
        this.orchestrator = orchestrator;
        this.moduleLoader = moduleLoader;
        this.currentFile = currentFile;
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
        this.context.set("print", {
            type: "func",
            value: ((...args: any[]) => {
                console.log(...args.map((a) => a.value));
                return { type: "nil", value: null };
            }) as any,
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
                    !typesMatch(defStmt.varType, value.type)
                ) {
                    // Only check if types are definitely known and mismatching
                    // This creates a nice runtime error if something slipped through or was dynamic
                    if (defStmt.varType === "dbl" && value.type === "int") {
                        throw this.createError(
                            stmt,
                            `Runtime Type Mismatch: Cannot assign '${typeToString(value.type)}' to '${typeToString(defStmt.varType)}'.`,
                            "Use double() conversion.",
                        );
                    }

                    throw this.createError(
                        stmt,
                        `Runtime Type Mismatch: Expected '${typeToString(defStmt.varType)}', got '${typeToString(value.type)}'`,
                    );
                }

                // Register variable
                this.context.set(defStmt.name, value);

                if (defStmt.isExported) {
                    this.exportedNames.add(defStmt.name);
                }
                return;
            }

            if (stmt.kind === "AssignmentStatement") {
                const assignStmt = stmt as AssignmentStatement;
                const value = await this.evaluateExpression(assignStmt.value);

                // Handle assignment based on assignee type
                if (assignStmt.assignee.type === "VarReference") {
                    const varName = assignStmt.assignee.varName;
                    const currentVal = this.context.get(varName);

                    // Runtime type check
                    if (currentVal) {
                        if (
                            value.type !== "unknown" &&
                            currentVal.type !== "unknown" &&
                            !typesMatch(value.type, currentVal.type)
                        ) {
                            if (
                                currentVal.type === "dbl" &&
                                value.type === "int"
                            ) {
                                throw this.createError(
                                    stmt,
                                    `Runtime Type Mismatch: Cannot assign '${typeToString(value.type)}' to '${typeToString(currentVal.type)}'.`,
                                );
                            }
                            throw this.createError(
                                stmt,
                                `Runtime Type Mismatch: Expected '${typeToString(currentVal.type)}', got '${typeToString(value.type)}'`,
                            );
                        }
                    }

                    this.context.assign(varName, value);
                } else if (assignStmt.assignee.type === "MemberExpression") {
                    const object = await this.evaluateExpression(
                        assignStmt.assignee.object,
                    );
                    if (object.type !== "obj") {
                        throw this.createError(
                            stmt,
                            `Cannot assign property of non-object type '${typeToString(object.type)}'`,
                        );
                    }
                    object.value[assignStmt.assignee.property] = value.value;
                } else if (assignStmt.assignee.type === "IndexExpression") {
                    const object = await this.evaluateExpression(
                        assignStmt.assignee.object,
                    );
                    const index = await this.evaluateExpression(
                        assignStmt.assignee.index,
                    );

                    // Array Assignment
                    if (
                        typeof object.type === "object" &&
                        object.type.base === "array"
                    ) {
                        if (index.type !== "int") {
                            throw this.createError(
                                stmt,
                                `Array index must be 'int', got '${typeToString(index.type)}'`,
                            );
                        }

                        const idx = index.value as number;
                        if (idx < 0 || idx >= object.value.length) {
                            throw this.createError(
                                stmt,
                                `Array index out of bounds: ${idx}`,
                            );
                        }

                        // Check element type compatibility (weak check for now, relies on Scanner)
                        const innerType = object.type.generic;
                        if (
                            innerType !== "unknown" &&
                            value.type !== "unknown" &&
                            !typesMatch(innerType, value.type)
                        ) {
                            throw this.createError(
                                stmt,
                                `Runtime Type Mismatch: Cannot assign '${typeToString(value.type)}' to array of '${typeToString(innerType)}'`,
                            );
                        }

                        object.value[idx] = value.value;
                    }
                    // Object Assignment
                    else if (object.type === "obj") {
                        if (index.type !== "str") {
                            throw this.createError(
                                stmt,
                                `Object index must be 'str', got '${typeToString(index.type)}'`,
                            );
                        }
                        object.value[index.value] = value.value;
                    } else {
                        throw this.createError(
                            stmt,
                            `Cannot index type '${typeToString(object.type)}'`,
                        );
                    }
                } else {
                    throw this.createError(stmt, "Invalid assignment target");
                }
                return;
            }

            if (stmt.kind === "ImportStatement") {
                const importStmt = stmt as ImportStatement;

                // Handle local file imports
                if (importStmt.moduleName.startsWith(".")) {
                    if (!this.moduleLoader) {
                        throw this.createError(
                            stmt,
                            `Module loader not configured. Cannot import '${importStmt.moduleName}'`,
                        );
                    }

                    const modulePath = importStmt.moduleName;
                    let moduleInterpreter: Interpreter;

                    // Check cache
                    if (this.moduleCache.has(modulePath)) {
                        moduleInterpreter = this.moduleCache.get(modulePath)!;
                    } else {
                        // Load module
                        const moduleCode = this.moduleLoader(
                            modulePath,
                            this.currentFile,
                        );
                        if (moduleCode === null) {
                            throw this.createError(
                                stmt,
                                `Module '${modulePath}' not found`,
                            );
                        }

                        // Recursive execution
                        try {
                            const lexer = new Lexer(moduleCode);
                            const tokens = lexer.tokenize();
                            const parser = new Parser(tokens, moduleCode);
                            const act = parser.parse();

                            moduleInterpreter = new Interpreter(
                                this.orchestrator,
                                this.moduleLoader,
                                modulePath,
                            );

                            // Share cache to avoid cycles/re-execution?
                            // For simplicity, we don't share cache map instance yet (would need refactor),
                            // but we cache the result in THIS interpreter.
                            // Ideally, we should share the cache map reference.
                            // Let's pass the cache map?
                            // Changing constructor signature is getting complex.
                            // For now, simple tree execution. Repeated imports in diamond dependencies will re-execute.
                            // This is acceptable for first iteration.
                            // Ideally we want singleton modules.

                            await moduleInterpreter.run(act, moduleCode);
                            this.moduleCache.set(modulePath, moduleInterpreter);
                        } catch (e: any) {
                            throw this.createError(
                                stmt,
                                `Error in module '${modulePath}': ${e.message}`,
                            );
                        }
                    }

                    // Import exports
                    for (const imp of importStmt.imports) {
                        const exportName = imp.name;
                        const varName = imp.alias || imp.name;

                        if (moduleInterpreter.exportedNames.has(exportName)) {
                            const val =
                                moduleInterpreter.context.get(exportName);
                            if (val) {
                                this.context.set(varName, val);
                            }
                        } else {
                            throw this.createError(
                                stmt,
                                `Export '${exportName}' not found in module '${importStmt.moduleName}'`,
                            );
                        }
                    }
                    return;
                }

                // Standard Packages
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

            if (stmt.kind === "IfStatement") {
                const ifStmt = stmt as IfStatement;
                const condition = await this.evaluateExpression(
                    ifStmt.condition,
                );
                // We assume strict boolean or truthy?
                // JS truthy is easy handled by `if (condition.value)`
                // But strict bool check:
                if (condition.type !== "bool" && condition.type !== "unknown") {
                    // For now, let's be strict if known
                    // Or just check value
                }

                if (condition.value) {
                    await this.executeStatement(ifStmt.thenBranch);
                } else if (ifStmt.elseBranch) {
                    await this.executeStatement(ifStmt.elseBranch);
                }
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
        } catch (e) {
            if (e instanceof ReturnSignal) throw e; // Propagate return

            // Check if it's already a formatted error (starts with Error:)
            // Our makeError returns an Error object where message starts with newline+Color codes etc.
            // But standard Error might wrap it.
            if (
                (e as Error).message &&
                ((e as Error).message.includes("--> line") ||
                    (e as Error).message.startsWith("\n"))
            ) {
                throw e;
            }
            throw this.createError(stmt, (e as Error).message);
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
            if (expr.type === "ArrayLiteral") {
                const values: any[] = [];
                let elemType: VariableType = "unknown";

                for (const elem of expr.elements) {
                    const val = await this.evaluateExpression(elem);
                    values.push(val.value);
                    if (elemType === "unknown" && val.type !== "unknown") {
                        elemType = val.type;
                    }
                }

                // If empty, defaults to array<unknown>
                const finalElemType: VariableType =
                    elemType === "unknown"
                        ? "unknown"
                        : (elemType as VariableType);

                return {
                    type: {
                        base: "array",
                        generic: finalElemType,
                    },
                    value: values,
                };
            }
            if (expr.type === "ObjectLiteral") {
                const result: Record<string, any> = {};

                for (const [key, valExpr] of Object.entries(expr.properties)) {
                    const val = await this.evaluateExpression(
                        valExpr as Expression,
                    );
                    result[key] = val.value;
                }
                // Objects are generic 'obj', not structural in runtime type string for now
                return { type: "obj", value: result };
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
            if (expr.type === "UnaryExpression") {
                const val = await this.evaluateExpression(expr.value);
                if (expr.operator === "!") {
                    return { type: "bool", value: !val.value };
                }
            }
            if (expr.type === "MemberExpression") {
                const object = await this.evaluateExpression(expr.object);
                if (object.type !== "obj") {
                    throw new Error(
                        `Cannot access property '${expr.property}' on type '${typeToString(object.type)}'`,
                    );
                }
                const val = object.value[expr.property];
                if (val === undefined) {
                    // Check if it's a method?
                    // Methods on objects are just properties of type 'func' (runtime).
                    // If undefined, it's strictly missing.
                    throw new Error(
                        `Property '${expr.property}' undefined on object`,
                    );
                }
                return this.wrap(val);
            }
            if (expr.type === "IndexExpression") {
                const object = await this.evaluateExpression(expr.object);
                const index = await this.evaluateExpression(expr.index);

                // Array Access
                if (
                    typeof object.type === "object" &&
                    object.type.base === "array"
                ) {
                    if (index.type !== "int") {
                        throw new Error(
                            `Array index must be 'int', got '${typeToString(index.type)}'`,
                        );
                    }

                    const idx = index.value as number;
                    if (idx < 0 || idx >= object.value.length) {
                        throw new Error(`Array index out of bounds: ${idx}`);
                    }

                    const val = object.value[idx];
                    return this.wrap(val);
                }

                // Object Access
                if (object.type === "obj") {
                    if (index.type !== "str") {
                        throw new Error(
                            `Object index must be 'str', got '${typeToString(index.type)}'`,
                        );
                    }
                    const val = object.value[index.value];
                    return this.wrap(val);
                }

                throw new Error(
                    `Cannot index type '${typeToString(object.type)}'`,
                );
            }

            if (expr.type === "CallExpression") {
                const funcWrapper = await this.evaluateExpression(expr.callee);

                if (!funcWrapper || funcWrapper.type !== "func") {
                    throw new Error(
                        `Callee is not a function. It is ${funcWrapper?.type}`,
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
                const closureCtx = this.context; // Capture current scope

                const jsFunc = async (...args: any[]) => {
                    // Create function scope
                    const parentCtx = this.context;
                    this.context = new Context(closureCtx); // Use closure scope as parent

                    // Bind params
                    // Bind params
                    for (let i = 0; i < expr.params.length; i++) {
                        const paramName = expr.params[i].name;
                        this.context.set(paramName, args[i]);
                    }

                    try {
                        if (Array.isArray(expr.body)) {
                            // Block body
                            for (const s of expr.body) {
                                await this.executeStatement(s);
                            }
                            // If we fall off end of function without return
                            return { type: "nil", value: undefined };
                        } else {
                            // Expression body
                            const res = await this.evaluateExpression(
                                expr.body,
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
        const { value, type } = await this.evaluateExpression(expr.value);

        // Validate types
        validateTypeConversion(type, expr.targetType);

        if (typesMatch(expr.targetType, type)) {
            // Identity conversion, re-wrap to ensure TS happiness or just return evaluated?
            // accessing 'value' from evaluated gives us unwrapped value.
            // We need to return a valid RuntimeValue.
            // The logic below reconstructs it safe.
        }

        return this.convertValue(value, expr.targetType);
    }

    private convertValue(value: any, targetType: VariableType): RuntimeValue {
        if (targetType === "str") return { type: "str", value: String(value) };
        if (targetType === "int")
            return { type: "int", value: Math.floor(Number(value)) };
        if (targetType === "dbl") return { type: "dbl", value: Number(value) };
        if (targetType === "bool")
            return { type: "bool", value: Boolean(value) };
        if (targetType === "obj") {
            if (typeof value === "object") return { type: "obj", value };
        }

        if (typeof targetType === "object" && targetType.base === "array") {
            if (!Array.isArray(value)) {
                throw new Error(
                    `Cannot convert non-array to ${typeToString(targetType)}`,
                );
            }
            // Recursive conversion
            const innerType = targetType.generic;
            const newValues = value.map(
                (v) => this.convertValue(v, innerType).value,
            );
            return { type: targetType, value: newValues };
        }

        throw new Error(
            `Conversion to '${JSON.stringify(targetType)}' not supported.`,
        );
    }

    private async evaluateTypecheck(
        expr: TypeCheckExpression,
    ): Promise<RuntimeValue> {
        const { type } = await this.evaluateExpression(expr.value);
        if (typeof type === "object" && type.base === "array") {
            // Return "array" or detailed type? Previous behavior was "array".
            // User prompt said "runtime value as ...".
            // typeof operator usually returns simple string.
            // Let's return "array" for now as per old behavior, or JSON if debugging.
            // If type is {base: "array", ...}, return "array".
            return { type: "str", value: "array" };
        }
        return { type: "str", value: type as string };
    }

    private async evaluateBinaryExpression(
        expr: BinaryExpression,
    ): Promise<RuntimeValue> {
        const left = await this.evaluateExpression(expr.left);
        const right = await this.evaluateExpression(expr.right);

        // Allow operations if one side is 'unknown'
        if (!typesMatch(left.type, right.type)) {
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
                case "%":
                    result = lVal % rVal;
                    break;
                case "==":
                    result = lVal === rVal;
                    break;
                case "!=":
                    result = lVal !== rVal;
                    break;
                case "<":
                    result = lVal < rVal;
                    break;
                case ">":
                    result = lVal > rVal;
                    break;
                case "<=":
                    result = lVal <= rVal;
                    break;
                case ">=":
                    result = lVal >= rVal;
                    break;
                case "&&":
                    result = lVal && rVal;
                    break;
                case "||":
                    result = lVal || rVal;
                    break;
                default:
                    throw new Error(`Unknown operator ${expr.operator}`);
            }
            return this.wrap(result);
        }

        if (type === "bool") {
            if (["==", "!=", "&&", "||"].includes(expr.operator)) {
                let result: boolean;
                switch (expr.operator) {
                    case "==":
                        result = lVal === rVal;
                        break;
                    case "!=":
                        result = lVal !== rVal;
                        break;
                    case "&&":
                        result = lVal && rVal;
                        break;
                    case "||":
                        result = lVal || rVal;
                        break;
                    default:
                        throw new Error("Unreachable");
                }
                return { type: "bool", value: result };
            }
            throw new Error(
                `Operator '${expr.operator}' not supported for type 'bool'`,
            );
        }

        if (type === "int" || type === "dbl") {
            let result: number | boolean;
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
                case "%":
                    result = lVal % rVal;
                    break;
                case "==":
                    result = lVal === rVal;
                    break;
                case "!=":
                    result = lVal !== rVal;
                    break;
                case "<":
                    result = lVal < rVal;
                    break;
                case ">":
                    result = lVal > rVal;
                    break;
                case "<=":
                    result = lVal <= rVal;
                    break;
                case ">=":
                    result = lVal >= rVal;
                    break;
                default:
                    throw new Error(`Unknown operator ${expr.operator}`);
            }

            if (typeof result === "boolean") {
                return { type: "bool", value: result };
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

        if (typeof type === "object" && (type as any).base === "array") {
            if (expr.operator === "+") {
                // Check right side compatibility if needed, or just concat values (JS behavior)
                // User said "arr1 + arr2".
                const rightType = right.type;
                if (
                    typeof rightType !== "object" ||
                    (rightType as any).base !== "array"
                ) {
                    throw new Error(
                        `Cannot add '${JSON.stringify(rightType)}' to '${JSON.stringify(type)}'`,
                    );
                }
                // Result type? If array<int> + array<int> -> array<int>.
                // If array<int> + array<unknown> -> array<int>.
                // We keep the left type mostly, or re-infer?
                // Simple approach: left type.
                return { type: type, value: lVal.concat(rVal) };
            }
            throw new Error(`Arrays only support addition.`);
        }

        throw new Error(
            `Operation '${expr.operator}' not supported for type '${JSON.stringify(type)}'`,
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
        if (val === null || val === undefined) {
            return { type: "nil", value: null };
        }
        if (typeof val === "number") {
            return Number.isInteger(val)
                ? { type: "int", value: val }
                : { type: "dbl", value: val };
        }
        if (typeof val === "string") return { type: "str", value: val };
        if (typeof val === "boolean") return { type: "bool", value: val };
        if (typeof val === "function") return { type: "func", value: val };
        if (val instanceof Error) return { type: "err", value: val };
        if (typeof val === "object") return { type: "obj", value: val };
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
