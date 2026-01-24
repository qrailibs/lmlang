import { packages, FunctionSignature } from "@lmlang/library";

import {
    DefStatement,
    ExpressionStatement,
    AssignmentStatement,
    IfStatement,
    ImportStatement,
} from "../parser/statements";
import { Expression } from "../types/expression";
import { makeError, LmlangError } from "../utils/err";
import { Lexer } from "../lexer/Lexer";
import { Parser } from "../parser/Parser";
import { AST, FunctionReturnType, Statement, VariableType } from "../types/ast";
import {
    typeToString,
    typesMatch,
    validateTypeConversion,
} from "../utils/typesystem";

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
    public globalContext: ScanContext = {
        vars: new Map(),
        signatures: new Map(),
    };

    private moduleLoader?: (path: string, base: string) => string | null;
    private currentFile: string;
    private scannedModules: Map<string, ScanContext> = new Map();

    constructor(
        source: string,
        moduleLoader?: (path: string, base: string) => string | null,
        currentFile: string = ".",
    ) {
        this.source = source;
        this.moduleLoader = moduleLoader;
        this.currentFile = currentFile;
        this.initializeBuiltins();
    }

    private initializeBuiltins() {
        // Builtin functions
        this.globalContext.vars.set("str", "func");
        this.globalContext.vars.set("int", "func");
        this.globalContext.vars.set("double", "func");
        this.globalContext.vars.set("print", "func"); // Builtin print
        // Add other builtins if needed
    }

    public scan(ast: AST): ScannerResult {
        this.errors = [];
        this.globalContext = { vars: new Map(), signatures: new Map() };

        this.initializeBuiltins();

        for (const stmt of ast.statements) {
            try {
                this.scanStatement(stmt, this.globalContext);
            } catch (e: any) {
                if (e.name === "LmlangError" || e instanceof LmlangError) {
                    this.errors.push(e);
                } else {
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
            // If it's a function, we must register it BEFORE scanning the value (to support recursion)
            if (defStmt.varType === "func") {
                // Register variable early
                ctx.vars.set(defStmt.name, defStmt.varType);

                // If value is Lambda, register signatures too
                const lambda = defStmt.value as any;
                if (lambda.type === "LambdaExpression") {
                    ctx.signatures.set(defStmt.name, {
                        params: lambda.params,
                        returnType: lambda.returnType,
                    });
                }
            }

            const exprType = this.inferExpressionType(defStmt.value, ctx);

            // Type check assignment
            // Allow assignment if expression type is 'unknown' (e.g. from runtime literal or complex expression)
            // But if both are known, they must match.
            if (
                exprType !== "unknown" &&
                !typesMatch(defStmt.varType, exprType)
            ) {
                if (defStmt.varType === "dbl" && exprType === "int") {
                    throw makeError(
                        this.source,
                        defStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Cannot assign '${typeToString(exprType)}' to '${typeToString(defStmt.varType)}'`,
                        "Use double() conversion function.",
                    );
                } else {
                    throw makeError(
                        this.source,
                        defStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Expected '${typeToString(defStmt.varType)}', got '${typeToString(exprType)}'`,
                    );
                }
            }

            // Register variable (if not already for func)
            if (defStmt.varType !== "func") {
                ctx.vars.set(defStmt.name, defStmt.varType);
            }
            return;
        }

        if (stmt.kind === "AssignmentStatement") {
            const assignStmt = stmt as AssignmentStatement;
            let targetType: VariableType;

            // Determine target type based on assignee
            if (assignStmt.assignee.type === "VarReference") {
                targetType =
                    this.lookupVar(assignStmt.assignee.varName, ctx) ||
                    "unknown";
                if (!this.lookupVar(assignStmt.assignee.varName, ctx)) {
                    throw makeError(
                        this.source,
                        assignStmt.loc || { line: 0, col: 0 },
                        `Variable '${assignStmt.assignee.varName}' not found`,
                    );
                }
            } else if (
                assignStmt.assignee.type === "MemberExpression" ||
                assignStmt.assignee.type === "IndexExpression"
            ) {
                targetType = this.inferExpressionType(assignStmt.assignee, ctx);
            } else {
                throw makeError(
                    this.source,
                    assignStmt.loc || { line: 0, col: 0 },
                    "Invalid assignment target. Must be a variable, field, or index.",
                );
            }

            const valueType = this.inferExpressionType(assignStmt.value, ctx);

            if (
                targetType !== "unknown" &&
                valueType !== "unknown" &&
                !typesMatch(targetType, valueType)
            ) {
                if (targetType === "dbl" && valueType === "int") {
                    throw makeError(
                        this.source,
                        assignStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Cannot assign '${typeToString(valueType)}' to '${typeToString(targetType)}'`,
                        "Use double() conversion or ensure value is double.",
                    );
                } else {
                    throw makeError(
                        this.source,
                        assignStmt.loc || { line: 0, col: 0 },
                        `Type Mismatch: Cannot assign '${typeToString(valueType)}' to '${typeToString(targetType)}'`,
                    );
                }
            }
            return;
        }

        if (stmt.kind === "IfStatement") {
            const ifStmt = stmt as IfStatement;
            const condType = this.inferExpressionType(ifStmt.condition, ctx);

            if (condType !== "bool" && condType !== "unknown") {
                throw makeError(
                    this.source,
                    ifStmt.condition.loc || { line: 0, col: 0 },
                    `Condition must be 'bool', got '${condType}'`,
                );
            }

            this.scanStatement(ifStmt.thenBranch, ctx);
            if (ifStmt.elseBranch) {
                this.scanStatement(ifStmt.elseBranch, ctx);
            }
            return;
        }

        if (stmt.kind === "IfStatement") {
            const ifStmt = stmt as IfStatement;
            const condType = this.inferExpressionType(ifStmt.condition, ctx);

            if (condType !== "bool" && condType !== "unknown") {
                throw makeError(
                    this.source,
                    ifStmt.condition.loc || { line: 0, col: 0 },
                    `Condition must be 'bool', got '${condType}'`,
                );
            }

            this.scanStatement(ifStmt.thenBranch, ctx);
            if (ifStmt.elseBranch) {
                this.scanStatement(ifStmt.elseBranch, ctx);
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
            const impStmt = stmt as ImportStatement;

            // Handle local file imports
            if (impStmt.moduleName.startsWith(".")) {
                if (!this.moduleLoader) {
                    throw makeError(
                        this.source,
                        impStmt.loc || { line: 0, col: 0 },
                        `Module loader not configured. Cannot import '${impStmt.moduleName}'`,
                    );
                }

                // Resolve path (basic resolution, assumes naive relative path handling for now)
                // In a real env like Node, we'd use path.resolve. Here we just key by given name or try to be smarter.
                // Assuming the moduleName is relative to currentFile's directory.
                // Since we don't have path lib, we rely on the loader to understand the path or we just pass it.
                // Or better: we let the consumer clean up paths?
                // Let's assume moduleName IS the path to load.
                const modulePath = impStmt.moduleName;

                // Check cache
                if (this.scannedModules.has(modulePath)) {
                    const moduleCtx = this.scannedModules.get(modulePath)!;
                    this.registerImports(impStmt, moduleCtx, ctx);
                    return;
                }

                // Load module
                const moduleCode = this.moduleLoader(
                    modulePath,
                    this.currentFile,
                );
                if (moduleCode === null) {
                    throw makeError(
                        this.source,
                        impStmt.loc || { line: 0, col: 0 },
                        `Module '${modulePath}' not found (relative to ${this.currentFile})`,
                    );
                }

                // Recursive scan
                try {
                    const lexer = new Lexer(moduleCode);
                    const tokens = lexer.tokenize();
                    const parser = new Parser(tokens, moduleCode);
                    const ast = parser.parse();
                    // Provide same loader to recursive scanner
                    const scanner = new Scanner(
                        moduleCode,
                        this.moduleLoader,
                        modulePath,
                    );
                    const result = scanner.scan(ast);

                    // Propagate errors from imported module?
                    // Maybe. Or just trust it. If it has errors, maybe we shouldn't import.
                    // But for now let's just use its context.
                    // Note: scanning populates globalContext of that scanner instance.

                    // Cache results
                    this.scannedModules.set(modulePath, scanner.globalContext);

                    // Register imports
                    this.registerImports(impStmt, scanner.globalContext, ctx);
                } catch (e: any) {
                    throw makeError(
                        this.source,
                        impStmt.loc || { line: 0, col: 0 },
                        `Error in module '${modulePath}': ${e.message}`,
                    );
                }
                return;
            }

            // Standard Library Imports
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
        if (expr.type === "ObjectLiteral") {
            const fields: Record<string, VariableType> = {};
            const signatures: Record<string, FunctionSignature> = {};

            for (const [key, valExpr] of Object.entries(expr.properties)) {
                const type = this.inferExpressionType(valExpr, ctx);
                fields[key] = type;

                // If function/lambda, try to capture signature
                if (valExpr.type === "LambdaExpression") {
                    // We can extract signature directly from AST
                    const lambda = valExpr;
                    signatures[key] = {
                        params: lambda.params.map((p) => ({
                            name: p.name,
                            type: typeToString(p.type), // Signature uses string representation
                        })),
                        returnType: typeToString(lambda.returnType),
                    };
                }
            }

            return {
                base: "struct",
                fields,
                signatures,
            };
        }

        if (expr.type === "MemberExpression") {
            const objType = this.inferExpressionType(expr.object, ctx);

            if (objType === "unknown" || objType === "obj") {
                return "unknown"; // Cannot validate generic objects
            }

            if (typeof objType === "object" && objType.base === "struct") {
                // Check field
                if (objType.fields && objType.fields[expr.property]) {
                    return objType.fields[expr.property];
                }
                // Check if it's a known signature (method)?
                if (objType.signatures && objType.signatures[expr.property]) {
                    return "func";
                }

                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Property '${expr.property}' does not exist on type '${typeToString(objType)}'`,
                );
            }

            throw makeError(
                this.source,
                expr.loc || { line: 0, col: 0 },
                `Property access on non-object type '${typeToString(objType)}'`,
            );
        }

        if (expr.type === "ArrayLiteral") {
            const unknownArray: VariableType = {
                base: "array",
                generic: "unknown",
            };
            if (expr.elements.length === 0) return unknownArray;

            // Infer first element
            const firstType = this.inferExpressionType(expr.elements[0], ctx);
            if (firstType === "unknown") return unknownArray;

            // Check consistency
            for (let i = 1; i < expr.elements.length; i++) {
                const type = this.inferExpressionType(expr.elements[i], ctx);
                if (!typesMatch(type, firstType) && type !== "unknown") {
                    throw makeError(
                        this.source,
                        expr.elements[i].loc || { line: 0, col: 0 },
                        `Array element type mismatch: Expected '${typeToString(firstType)}', got '${typeToString(type)}'`,
                    );
                }
            }
            return { base: "array", generic: firstType };
        }

        if (expr.type === "IndexExpression") {
            const objType = this.inferExpressionType(expr.object, ctx);
            const indexType = this.inferExpressionType(expr.index, ctx);

            if (objType === "unknown") return "unknown";

            // Array Indexing
            if (typeof objType === "object" && objType.base === "array") {
                if (indexType !== "int" && indexType !== "unknown") {
                    throw makeError(
                        this.source,
                        expr.index.loc || { line: 0, col: 0 },
                        `Array index must be 'int', got '${typeToString(indexType)}'`,
                    );
                }
                return objType.generic;
            }

            // Object Indexing
            if (
                objType === "obj" ||
                (typeof objType === "object" && objType.base === "struct")
            ) {
                if (indexType !== "str" && indexType !== "unknown") {
                    throw makeError(
                        this.source,
                        expr.index.loc || { line: 0, col: 0 },
                        `Object index must be 'str', got '${typeToString(indexType)}'`,
                    );
                }
                return "unknown"; // Dynamic access returns unknown
            }

            throw makeError(
                this.source,
                expr.object.loc || { line: 0, col: 0 },
                `Cannot index type '${typeToString(objType)}'. Only arrays and objects can be indexed.`,
            );
        }

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

            if (!typesMatch(leftType, rightType)) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Binary Operation Type Mismatch: '${typeToString(leftType)}' vs '${typeToString(rightType)}'`,
                );
            }

            // Define return types for operators
            if (["+", "-", "*", "/"].includes(expr.operator)) {
                if (leftType === "int" || leftType === "dbl") {
                    if (expr.operator === "/") return "dbl";
                    return leftType;
                }
                if (leftType === "str" && expr.operator === "+") {
                    return "str";
                }

                if (leftType === "obj" && expr.operator === "+") {
                    return "obj";
                }

                if (
                    typeof leftType === "object" &&
                    leftType.base === "array" &&
                    expr.operator === "+"
                ) {
                    return leftType;
                }

                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Operator '${expr.operator}' not supported for type '${typeToString(leftType)}'`,
                );
            }

            // Comparison & Logical
            if (["==", "!=", "<", ">", "<=", ">="].includes(expr.operator)) {
                // Determine if comparable
                if (typesMatch(leftType, rightType)) return "bool";
                // Allow mixing int/dbl?
                if (
                    (leftType === "int" || leftType === "dbl") &&
                    (rightType === "int" || rightType === "dbl")
                )
                    return "bool";

                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Cannot compare '${typeToString(leftType)}' and '${typeToString(rightType)}'`,
                );
            }

            if (["&&", "||"].includes(expr.operator)) {
                if (leftType !== "bool") {
                    throw makeError(
                        this.source,
                        expr.left.loc || { line: 0, col: 0 },
                        `Logical operator expects 'bool', got '${typeToString(leftType)}'`,
                    );
                }
                if (rightType !== "bool") {
                    throw makeError(
                        this.source,
                        expr.right.loc || { line: 0, col: 0 },
                        `Logical operator expects 'bool', got '${typeToString(rightType)}'`,
                    );
                }
                return "bool";
            }
        }

        if (expr.type === "CallExpression") {
            // Check callee
            let calleeType: VariableType;
            let signature: FunctionSignature | undefined;

            if (expr.callee.type === "VarReference") {
                calleeType =
                    this.lookupVar(expr.callee.varName, ctx) || "unknown";
                if (calleeType === "unknown") {
                    // Check if it's not found vs just unknown type
                    if (!this.lookupVar(expr.callee.varName, ctx)) {
                        throw makeError(
                            this.source,
                            expr.loc || { line: 0, col: 0 },
                            `Function '${expr.callee.varName}' not found`,
                        );
                    }
                }
                signature = this.lookupSignature(expr.callee.varName, ctx);
            } else if (expr.callee.type === "MemberExpression") {
                // Determine object type to find signature
                const objType = this.inferExpressionType(
                    expr.callee.object,
                    ctx,
                );
                if (typeof objType === "object" && objType.base === "struct") {
                    if (
                        objType.signatures &&
                        objType.signatures[expr.callee.property]
                    ) {
                        signature = objType.signatures[expr.callee.property];
                        calleeType = "func";
                    } else if (
                        objType.fields &&
                        objType.fields[expr.callee.property]
                    ) {
                        calleeType = objType.fields[expr.callee.property];
                    } else {
                        // Error logic handled in member expr inference or here?
                        // If we inferred MemberExpression before, it would have thrown if missing.
                        // But here we need signature.
                        calleeType = "unknown";
                    }
                } else {
                    calleeType = "unknown";
                }
            } else {
                calleeType = this.inferExpressionType(expr.callee, ctx);
            }

            if (calleeType !== "func" && calleeType !== "unknown") {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    `Callee is not a function. It is '${typeToString(calleeType)}'`,
                );
            }

            // Check args and signature

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
            // Built-in casting functions
            if (expr.callee.type === "VarReference") {
                if (expr.callee.varName === "str") return "str";
                if (expr.callee.varName === "int") return "int";
                if (expr.callee.varName === "double") return "dbl";
            }

            // Since we don't have function signatures for everything yet, we have to assume 'unknown'
            return "unknown";
        }

        if (expr.type === "TypeConversionExpression") {
            const sourceType = this.inferExpressionType(expr.value, ctx);
            // Validate conversion
            try {
                validateTypeConversion(sourceType, expr.targetType);
            } catch (e: any) {
                throw makeError(
                    this.source,
                    expr.loc || { line: 0, col: 0 },
                    e.message,
                );
            }
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

        if (expr.type === "UnaryExpression") {
            const valType = this.inferExpressionType(expr.value, ctx);
            if (expr.operator === "!") {
                if (valType !== "bool" && valType !== "unknown") {
                    throw makeError(
                        this.source,
                        expr.loc || { line: 0, col: 0 },
                        `Operator '!' expects 'bool', got '${valType}'`,
                    );
                }
                return "bool";
            }
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
                } else if (stmt.kind === "IfStatement") {
                    const ifStmt = stmt as IfStatement;
                    this.scanScopeExpression(ifStmt.condition, ctx, targetLoc);
                    this.scanScope([ifStmt.thenBranch], ctx, targetLoc); // Recurse statement
                    if (ifStmt.elseBranch)
                        this.scanScope([ifStmt.elseBranch], ctx, targetLoc);
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
        } else if (expr.type === "UnaryExpression") {
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

    private registerImports(
        impStmt: ImportStatement,
        sourceCtx: ScanContext,
        targetCtx: ScanContext,
    ) {
        for (const imp of impStmt.imports) {
            const exportName = imp.name;
            const alias = imp.alias || imp.name;

            // In our current simple model, we just copy the var type and signature.
            // Ideally we check if it was marked as exported, but we don't track exports in ScanContext yet.
            // For now, we assume if it's in the top-level scope of the module, it's importable.
            // (Strict export checking requires tracking exports in ScanContext)

            if (sourceCtx.vars.has(exportName)) {
                targetCtx.vars.set(alias, sourceCtx.vars.get(exportName)!);
                if (sourceCtx.signatures.has(exportName)) {
                    targetCtx.signatures.set(
                        alias,
                        sourceCtx.signatures.get(exportName)!,
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
    }
}
