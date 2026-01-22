import { Lexer } from "../src/lexer/Lexer";
import { TokenType } from "../src/types/token";

describe("Lexer", () => {
    test("tokenize runtime block", () => {
        const input = `
            int sum = <py>
                return np.sum([1, 2, 3])
            </py>
            write("Sum output:", sum);
        `;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();

        // Validate structure briefly
        const pyToken = tokens.find(
            (t) => t.type === TokenType.RuntimeBlockBody,
        );
        expect(pyToken).toBeDefined();
        expect(pyToken?.value).toContain("return np.sum([1, 2, 3])");

        // Validate Comma presence
        const commaToken = tokens.find((t) => t.type === TokenType.Comma);
        expect(commaToken).toBeDefined();
    });

    test("throw on unclosed string", () => {
        const input = `write("Hello World);`;
        const lexer = new Lexer(input);
        expect(() => lexer.tokenize()).toThrow("Unterminated string");
    });

    test("handle long strings", () => {
        const longStr = "a".repeat(10000);
        const input = `"${longStr}";`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();

        expect(tokens).toHaveLength(3); // String, Semicolon, EOF
        expect(tokens[0].value).toBe(longStr);
    });

    test("tokenize runtime block with complex content", () => {
        // Contains < inside, and lookalike closing tags
        const input = `<py>
            if x < 10:
                print("</div>")
                print("</ py>") // spaces match logic? Lexer checks exact tag name
        </py>`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();

        const block = tokens.find((t) => t.type === TokenType.RuntimeBlockBody);
        expect(block).toBeDefined();
        expect(block?.value).toContain("if x < 10:");
        expect(block?.value).toContain('print("</div>")');
    });

    test("unclosed runtime block consumes until EOF", () => {
        // Current implementation consumes to EOF if not closed
        const input = `<py>
            print("Forever running")
        `;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();

        const block = tokens.find((t) => t.type === TokenType.RuntimeBlockBody);
        expect(block).toBeDefined();
        expect(block?.value).toContain('print("Forever running")');
        // It consumes newlines too
    });
});
