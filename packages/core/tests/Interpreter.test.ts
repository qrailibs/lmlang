import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Scanner } from "../src/scanner/Scanner";
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

    test("if else execution", async () => {
        const input = `
            int x = 10;
            int res = 0;
            if (x > 5) {
                res = 1;
            } else {
                res = 2;
            }
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("res")?.value).toBe(1);
    });

    test("if else execution false path", async () => {
        const input = `
            int x = 1;
            int res = 0;
            if (x > 5) {
                res = 1;
            } else {
                res = 2;
            }
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("res")?.value).toBe(2);
    });

    test("logical operators", async () => {
        const input = `
            bool a = true && false;
            bool b = true || false;
            bool c = !true;
            bool d = 1 < 2;
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("a")?.value).toBe(false);
        expect(interpreter.getVariable("b")?.value).toBe(true);
        expect(interpreter.getVariable("c")?.value).toBe(false);
        expect(interpreter.getVariable("d")?.value).toBe(true);
    });
});
