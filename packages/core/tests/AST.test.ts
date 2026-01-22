import {
    AST,
    findRuntimeLiterals,
    RuntimeLiteral,
    findNodeAt,
    findNodeStack,
} from "../src";

describe("AST Utils", () => {
    describe("findRuntimeLiterals", () => {
        it("should find runtime literals in AST", () => {
            const runtimeLiteral: RuntimeLiteral = {
                type: "RuntimeLiteral",
                runtimeName: "python",
                attributes: {},
                code: "print('hello')",
            };

            const ast: AST = {
                statements: [
                    {
                        kind: "ExpressionStatement",
                        expression: runtimeLiteral,
                    } as any,
                ],
            };

            const result = findRuntimeLiterals(ast);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(runtimeLiteral);
        });

        it("should find nested runtime literals", () => {
            const runtimeLiteral1: RuntimeLiteral = {
                type: "RuntimeLiteral",
                runtimeName: "bash",
                attributes: {},
                code: "ls",
            };
            const runtimeLiteral2: RuntimeLiteral = {
                type: "RuntimeLiteral",
                runtimeName: "js",
                attributes: {},
                code: "console.log()",
            };

            const ast: AST = {
                statements: [
                    {
                        kind: "IfStatement",
                        condition: { type: "BoolLiteral", value: true },
                        thenBranch: [
                            {
                                kind: "ExpressionStatement",
                                expression: runtimeLiteral1,
                            } as any,
                        ],
                        elseBranch: [
                            {
                                kind: "ExpressionStatement",
                                expression: runtimeLiteral2,
                            } as any,
                        ],
                    } as any,
                ],
            };

            const result = findRuntimeLiterals(ast);
            expect(result).toHaveLength(2);
            expect(result).toContain(runtimeLiteral1);
            expect(result).toContain(runtimeLiteral2);
        });
    });

    describe("Node Finding", () => {
        it("should find node stack", () => {
            const targetExpr = {
                type: "IntLiteral",
                value: 42,
                loc: { line: 1, col: 10, endLine: 1, endCol: 12 },
            };

            const defStmt = {
                kind: "DefStatement",
                name: "a",
                varType: "int",
                value: targetExpr,
                loc: { line: 1, col: 0, endLine: 1, endCol: 12 },
            } as any;

            const ast: AST = {
                statements: [defStmt],
            };

            // find at col 11 (inside IntLiteral)
            const stack = findNodeStack(ast, {
                line: 1,
                col: 11,
            });

            expect(stack).toHaveLength(2);
            expect(stack[0]).toBe(defStmt);
            expect(stack[1]).toBe(targetExpr);
        });

        it("should find node at specific position", () => {
            const targetExpr = {
                type: "IntLiteral",
                value: 42,
                loc: { line: 1, col: 10, endLine: 1, endCol: 12 },
            };

            const defStmt = {
                kind: "DefStatement",
                name: "a",
                varType: "int",
                value: targetExpr,
                loc: { line: 1, col: 0, endLine: 1, endCol: 12 },
            } as any;

            const ast: AST = {
                statements: [defStmt],
            };

            // find at col 11
            const node = findNodeAt(ast, {
                line: 1,
                col: 11,
            });
            expect(node).toBe(targetExpr);
        });

        it("should return undefined if no node found", () => {
            const ast: AST = {
                statements: [],
            };
            const node = findNodeAt(ast, {
                line: 1,
                col: 0,
            });
            expect(node).toBeUndefined();
        });
    });
});
