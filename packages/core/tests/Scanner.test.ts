import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Scanner } from "../src/scanner/Scanner";

describe("Scanner", () => {
    function scan(input: string) {
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const scanner = new Scanner(input);
        return scanner.scan(ast);
    }

    test("detect undefined variable", () => {
        const result = scan("a = 10;");
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("Variable 'a' not found");
    });

    test("detect type mismatch in def", () => {
        const result = scan('int a = "hello";');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("Type Mismatch");
    });

    test("detect type mismatch in assignment", () => {
        const result = scan('int a = 10; a = "hello";');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("Type Mismatch");
    });

    test("detect invalid binary op", () => {
        const result = scan('int a = 10; a = a + "hello";');
        expect(result.errors.length).toBeGreaterThan(0);
        // Expect error about operator '+' not supported for int + str, or mismatch on assignment
    });
});
