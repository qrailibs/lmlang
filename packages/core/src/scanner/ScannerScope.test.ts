import { Scanner } from "./Scanner";
import { Parser } from "../parser/Parser";
import { Lexer } from "../lexer/Lexer";
import { VariableType } from "../parser/types";

function getScope(code: string, loc: { line: number; col: number }) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // Scanner
    const scanner = new Scanner(code);
    const scope = scanner.getScopeAt(ast, loc);
    return scope;
}

function resolveVar(scope: any, name: string): VariableType | undefined {
    if (scope.vars.has(name)) return scope.vars.get(name);
    if (scope.parent) return resolveVar(scope.parent, name);
    return undefined;
}

describe("Scanner Scope Analysis", () => {
    test("Global variables", () => {
        const code = `
        int x = 10
        int y = 20
        `;
        // Line 3
        const scope = getScope(code, { line: 2, col: 0 }); // 0-indexed
        expect(resolveVar(scope, "x")).toBe("int");
        expect(resolveVar(scope, "y")).toBe("int");
    });

    test("Inside Block", () => {
        const code = `
        int x = 10
        {
            int z = 5
            x = 5
        }
        `;
        // Inside block: line 3
        const scope = getScope(code, { line: 3, col: 12 });
        expect(resolveVar(scope, "x")).toBe("int"); // Inherited
        expect(resolveVar(scope, "z")).toBe("int"); // Local
    });

    test("Inside Function", () => {
        const code = `
        func foo (int a): int {
            int b = 10
            return a + b
        }
        `;
        // Inside function: line 2 or 3
        const scope = getScope(code, { line: 2, col: 12 });
        expect(resolveVar(scope, "a")).toBe("int");
        expect(resolveVar(scope, "b")).toBe("int");
    });

    test("Nested Function", () => {
        const code = `
        func foo (int a): int {
            func bar (int b): int {
                 return a + b
            }
            return 0
        }
        `;
        // Inside inner function
        const scope = getScope(code, { line: 3, col: 20 });
        expect(resolveVar(scope, "a")).toBe("int");
        expect(resolveVar(scope, "b")).toBe("int");
    });

    test("Cursor position handling", () => {
        const code = `int x = 10`;
        const scope = getScope(code, { line: 0, col: 15 }); // End of line
        expect(resolveVar(scope, "x")).toBe("int");
    });
});
