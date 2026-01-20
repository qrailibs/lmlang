import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import { ExpressionStatement } from "../src/parser/statements";

describe("Parser", () => {
    test("parse call with multiple arguments", () => {
        const input = `write("Sum output:", 200);`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);

        const ast = parser.parse();
        expect(ast.statements).toHaveLength(1);

        const stmt = ast.statements[0] as ExpressionStatement;

        if (stmt.kind !== "ExpressionStatement") {
            throw new Error("Expected ExpressionStatement");
        }

        const expr = stmt.expression;
        if (expr.type === "CallExpression") {
            expect(expr.arguments).toHaveLength(2);
            expect(expr.arguments[0].type).toBe("StringLiteral");
            expect(expr.arguments[1].type).toBe("IntLiteral");
        } else {
            // @ts-ignore
            fail("Expected CallExpression");
        }
    });

    test("parse call with single argument", () => {
        const input = `print(100);`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ExpressionStatement;

        if (stmt.kind !== "ExpressionStatement") {
            throw new Error("Expected ExpressionStatement");
        }
        const expr = stmt.expression;
        if (expr.type === "CallExpression") {
            expect(expr.arguments).toHaveLength(1);
        }
    });
});
