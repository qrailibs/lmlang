import { Lexer } from "../src/lexer/Lexer";
import { TokenType } from "../src/lexer/TokenType";

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

        console.log(tokens);

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

    test("tokenize mixed content with commas", () => {
        const input = `func add(a, b) { return a + b; }`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();

        expect(tokens.filter((t) => t.type === TokenType.Comma)).toHaveLength(
            1,
        );
    });
});
