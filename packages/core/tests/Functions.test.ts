import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Scanner } from "../src/scanner/Scanner";
import { Interpreter } from "../src/interpreter/Interpreter";
import { DefStatement, ExpressionStatement } from "../src/parser/statements";

describe("Functions Test Suite", () => {
    // --- Helpers ---
    function parse(input: string) {
        const parser = new Parser(new Lexer(input).tokenize(), input);
        return parser.parse();
    }

    async function execute(input: string) {
        const ast = parse(input);

        // Static analysis scan
        const scanner = new Scanner(input);
        const scanRes = scanner.scan(ast);
        if (scanRes.errors.length > 0) {
            throw new Error(
                `Scan Errors: ${scanRes.errors.map((e) => e.message).join(", ")}`,
            );
        }

        const interpreter = new Interpreter();
        await interpreter.run(ast, input);
        return interpreter;
    }

    // --- 1. Basic Function Call ---

    test("Parsing: function declaration", () => {
        const input = `func add(int a, int b): int { return a + b; }`;
        const ast = parse(input);

        expect(ast.statements).toHaveLength(1);
        const stmt = ast.statements[0] as DefStatement;
        expect(stmt.kind).toBe("DefStatement");
        expect(stmt.name).toBe("add");
        expect(stmt.varType).toBe("func");

        const lambda = stmt.value as any;
        expect(lambda.type).toBe("LambdaExpression");
        expect(lambda.params).toHaveLength(2);
        expect(lambda.returnType).toBe("int");
    });

    test("Execution: basic function call with side effects", async () => {
        const input = `
            int calls = 0;
            func add(): void { calls++ }
            
            add();
            add();
        `;
        const interpreter = await execute(input);
        const calls = interpreter.getVariable("calls");
        expect(calls?.value).toBe(2);
    });

    // --- 2. Call with Arguments ---

    test("Parsing: call with multiple arguments", () => {
        const input = `write("Sum output:", 200);`;
        const ast = parse(input);
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as any;

        expect(expr.type).toBe("CallExpression");
        expect(expr.arguments).toHaveLength(2);
        expect(expr.arguments[0].type).toBe("StringLiteral");
        expect(expr.arguments[1].type).toBe("IntLiteral");
    });

    test("Parsing: call with single argument", () => {
        const input = `print(100);`;
        const ast = parse(input);
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as any;

        expect(expr.type).toBe("CallExpression");
        expect(expr.arguments).toHaveLength(1);
    });

    test("Execution: arguments passing consistency", async () => {
        const input = `
            func add1(int a, int b): int { return a + b; }
            int r1 = add1(10, 20);
        `;
        const interpreter = await execute(input);
        expect(interpreter.getVariable("r1")?.value).toBe(30);
    });

    // --- 3. Recursion ---

    test("Execution: recursion (Fibonacci)", async () => {
        const code = `
            func fib(int v): int {
                if (v <= 1) {
                    return v;
                }
                return fib(v-1) + fib(v-2);
            }
            int res = fib(10);
        `;
        const interpreter = await execute(code);
        const res = interpreter.getVariable("res");
        expect(res?.value).toBe(55);
    });

    // --- 4. Lambda Declaration & Usage ---

    test("Execution: lambda declaration and call", async () => {
        const input = `
            func add2 = (int a, int b): int => a + b;
            int r2 = add2(10, 20);
        `;
        const interpreter = await execute(input);
        expect(interpreter.getVariable("r2")?.value).toBe(30);
    });

    test("Execution: lambda side effects", async () => {
        const input = `
            int calls = 0;
            func tick = (): int => calls++;
            
            tick();
            tick();
        `;
        const interpreter = await execute(input);
        const calls = interpreter.getVariable("calls");
        expect(calls?.value).toBe(2);
    });

    test("Execution: consistency between function and lambda", async () => {
        const input = `
            func add1(int a, int b): int { return a + b; }
            func add2 = (int a, int b): int => a + b;
            
            int r1 = add1(10, 20);
            int r2 = add2(10, 20);
        `;
        const interpreter = await execute(input);
        expect(interpreter.getVariable("r1")?.value).toBe(30);
        expect(interpreter.getVariable("r2")?.value).toBe(30);
    });
});
