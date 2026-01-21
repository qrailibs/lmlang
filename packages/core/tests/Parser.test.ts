import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import {
    ExpressionStatement,
    DefStatement,
    AssignmentStatement,
    ImportStatement,
    BlockStatement,
    ReturnStatement,
} from "../src/parser/statements";

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

    test("parse variable declaration", () => {
        const input = `int a = 10;`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

        expect(ast.statements).toHaveLength(1);
        const stmt = ast.statements[0] as DefStatement;
        expect(stmt.kind).toBe("DefStatement");
        expect(stmt.name).toBe("a");
        expect(stmt.varType).toBe("int");
        expect(stmt.value.type).toBe("IntLiteral");
    });

    test("parse function declaration", () => {
        const input = `func add(int a, int b): int { return a + b; }`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

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

    test("parse assignment", () => {
        const input = `a = 20;`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

        const stmt = ast.statements[0] as AssignmentStatement;
        expect(stmt.kind).toBe("AssignmentStatement");
        expect(stmt.name).toBe("a");
        expect(stmt.value.type).toBe("IntLiteral");
    });

    test("parse return statement", () => {
        const input = `return 100;`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

        const stmt = ast.statements[0] as ReturnStatement;
        expect(stmt.kind).toBe("ReturnStatement");
        expect(stmt.value?.type).toBe("IntLiteral");
    });

    test("parse import statement", () => {
        const input = `import { Foo } from "bar";`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

        const stmt = ast.statements[0] as ImportStatement;
        expect(stmt.kind).toBe("ImportStatement");
        expect(stmt.moduleName).toBe("bar");
        expect(stmt.imports[0].name).toBe("Foo");
    });

    test("parse block statement", () => {
        const input = `{ int a = 1; }`;
        const parser = new Parser(new Lexer(input).tokenize());
        const ast = parser.parse();

        const stmt = ast.statements[0] as BlockStatement;
        expect(stmt.kind).toBe("BlockStatement");
        expect(stmt.statements).toHaveLength(1);
    });
});
