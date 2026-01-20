import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { Scanner } from "../src/scanner/Scanner";

const code = `
func test(): int {
    return 1 + "b"
}
`;

console.log("--- Scanning Code ---");
const lexer = new Lexer(code);
const tokens = lexer.tokenize();
const parser = new Parser(tokens);
const ast = parser.parse();
const scanner = new Scanner(code);
const result = scanner.scan(ast);

console.log("Errors found:", result.errors.length);
result.errors.forEach((err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Loc: Line ${err.loc?.line}, Col ${err.loc?.col}`);
});
