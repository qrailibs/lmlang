import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Scanner } from "../src/scanner/Scanner";
import { Interpreter } from "../src/interpreter/Interpreter";

describe("Interpreter", () => {
    async function run(input: string) {
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const interpreter = new Interpreter();
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

    test("implicit void return", async () => {
        const input = `
            func test() {
                int x = 1;
            }
            test();
        `;
        // Should not throw
        await run(input);
    });

    test("object field assignment", async () => {
        const input = `
            obj o = {val = 1};
            o.val = 2;
            int res = int(o.val);
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("res")?.value).toBe(2);
    });

    test("array index assignment", async () => {
        const input = `
            array[int] arr = [1, 2, 3];
            arr[0] = 5;
            int res = arr[0];
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("res")?.value).toBe(5);
    });

    test("object dynamic index assignment", async () => {
        const input = `
            obj o = {val = 1};
            o["key"] = 5;
            int res = int(o["key"]);
        `;
        const interpreter = await run(input);
        expect(interpreter.getVariable("res")?.value).toBe(5);
    });
});
