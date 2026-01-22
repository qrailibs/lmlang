import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Interpreter } from "../src/interpreter/Interpreter";

describe("Interpreter", () => {
    async function run(input: string) {
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const interpreter = new Interpreter();
        // We capture console.log or use a custom orchestrator if needed to verify output
        // But for unit tests, we might want to expose Context or Return values?
        // The Interpreter doesn't expose context publicly.
        // We'll wrap check in a way that output is verified or state is checked.
        // For now, let's verify it runs without error and maybe we can mock Context if we refactor.
        // Or we can add a helper "evaluate" to Interpreter for testing.
        // Since we can't easily check state, we'll rely on "return" signals if we wrap in a function call?
        // Or we can use `print` mock.

        await interpreter.run(ast, input);
        return interpreter;
    }

    test("lambda vs function consistency", async () => {
        const input = `
            func add1(int a, int b): int { return a + b; }
            func add2 = (int a, int b): int => a + b;
            
            int r1 = add1(10, 20);
            int r2 = add2(10, 20);
        `;

        const interpreter = await run(input);

        const r1 = interpreter.getVariable("r1");
        const r2 = interpreter.getVariable("r2");

        expect(r1?.value).toBe(30);
        expect(r2?.value).toBe(30);
    });

    test("function side effects", async () => {
        const input = `
            int calls = 0;
            func add(): void { calls++ }
            
            add();
            add();
        `;
        const interpreter = await run(input);
        const calls = interpreter.getVariable("calls");
        expect(calls?.value).toBe(2);
    });

    test("lambda side effects", async () => {
        const input = `
            int calls = 0;
            func tick = (): int => calls++;
            
            tick();
            tick();
        `;
        const interpreter = await run(input);
        const calls = interpreter.getVariable("calls");
        expect(calls?.value).toBe(2);
    });
});
