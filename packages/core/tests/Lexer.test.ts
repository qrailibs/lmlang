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
    test("tokenize booleans", () => {
        const input = "true false";
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();
        expect(tokens[0].type).toBe(TokenType.BoolLiteral);
        expect(tokens[1].type).toBe(TokenType.BoolLiteral);
    });

    test("tokenize operators", () => {
        const input = "== != < > <= >= && || !";
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();
        const types = tokens.map((t) => t.type);
        expect(types).toContain(TokenType.Equal);
        expect(types).toContain(TokenType.NotEqual);
        expect(types).toContain(TokenType.Less);
        expect(types).toContain(TokenType.Greater);
        expect(types).toContain(TokenType.LessEqual);
        expect(types).toContain(TokenType.GreaterEqual);
        expect(types).toContain(TokenType.And);
        expect(types).toContain(TokenType.Or);
        expect(types).toContain(TokenType.Bang);
    });

    test("tokenize runtime block with attributes", () => {
        const code = "str r = <bash n={FIB}>code</bash>";
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();

        // Ensure > becomes RAngle
        const tagClose = tokens.find((t) => t.type === TokenType.RAngle);
        expect(tagClose).toBeDefined();

        const block = tokens.find((t) => t.type === TokenType.RuntimeBlockBody);
        expect(block).toBeDefined();
        expect(block?.value).toBe("code");
    });

    test("tokenize runtime block with nested expressions in attributes", () => {
        const code = "<bash n={a > b}>code</bash>";
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();

        const greater = tokens.find((t) => t.type === TokenType.Greater);
        expect(greater).toBeDefined();

        const tagClose = tokens.find((t) => t.type === TokenType.RAngle);
        expect(tagClose).toBeDefined();

        // Verify RAngle is after Greater
        expect(tokens.indexOf(tagClose!)).toBeGreaterThan(
            tokens.indexOf(greater!),
        );
    });
});
