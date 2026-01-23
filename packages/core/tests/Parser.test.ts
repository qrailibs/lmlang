import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import {
    ExpressionStatement,
    DefStatement,
    AssignmentStatement,
    ImportStatement,
    BlockStatement,
    ReturnStatement,
    IfStatement,
} from "../src/parser/statements";

describe("Parser", () => {
    test("parse variable declaration", () => {
        const input = `int a = 10;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        expect(ast.statements).toHaveLength(1);
        const stmt = ast.statements[0] as DefStatement;
        expect(stmt.kind).toBe("DefStatement");
        expect(stmt.name).toBe("a");
        expect(stmt.varType).toBe("int");
        expect(stmt.value.type).toBe("IntLiteral");
    });

    test("parse assignment", () => {
        const input = `a = 20;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as AssignmentStatement;
        expect(stmt.kind).toBe("AssignmentStatement");
        expect(stmt.name).toBe("a");
        expect(stmt.value.type).toBe("IntLiteral");
    });

    test("parse return statement", () => {
        const input = `return 100;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ReturnStatement;
        expect(stmt.kind).toBe("ReturnStatement");
        expect(stmt.value?.type).toBe("IntLiteral");
    });

    test("parse import statement", () => {
        const input = `import { Foo } from "bar";`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ImportStatement;
        expect(stmt.kind).toBe("ImportStatement");
        expect(stmt.moduleName).toBe("bar");
        expect(stmt.imports[0].name).toBe("Foo");
    });

    test("parse block statement", () => {
        const input = `{ int a = 1; }`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as BlockStatement;
        expect(stmt.kind).toBe("BlockStatement");
        expect(stmt.statements).toHaveLength(1);
    });

    test("parse if statement", () => {
        const input = `if (x > 10) { print("large"); } else { print("small"); }`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as IfStatement;
        expect(stmt.kind).toBe("IfStatement");
        expect(stmt.condition.type).toBe("BinaryExpression");
        expect(stmt.thenBranch.kind).toBe("BlockStatement");
        expect(stmt.elseBranch?.kind).toBe("BlockStatement");
    });

    test("parse operator precedence", () => {
        const input = `a == b && c < d || !e`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        // Structure should be: ( (a==b) && (c<d) ) || (!e)
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as any; // BinaryExpression

        expect(expr.operator).toBe("||");
        expect(expr.left.operator).toBe("&&");
        expect(expr.right.type).toBe("UnaryExpression");
    });

    test("parse runtime block with attributes", () => {
        const input = `str res = <bash n={FIB}>echo hi</bash>;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as DefStatement;
        expect(stmt.kind).toBe("DefStatement");

        const runtime = stmt.value as any;
        expect(runtime.type).toBe("RuntimeLiteral");
        expect(runtime.runtimeName).toBe("bash");
        expect(runtime.attributes["n"]).toBeDefined();
        expect(runtime.code).toBe("echo hi");
    });
});
