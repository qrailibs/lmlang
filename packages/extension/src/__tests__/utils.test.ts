import { findConfigFile } from "../utils";
import * as fs from "fs";
import * as path from "path";
import { AST, Statement, RuntimeLiteral, ASTUtils } from "@lmlang/core";

// Mock fs module
jest.mock("fs");

describe("Utils", () => {
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
                        type: "ExpressionStatement",
                        expression: runtimeLiteral,
                    } as any, // Cast to any because Statement type might be strict
                ],
            };

            const result = ASTUtils.findRuntimeLiterals(ast);
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
                        type: "IfStatement",
                        condition: { type: "BoolLiteral", value: true },
                        thenBranch: [
                            {
                                type: "ExpressionStatement",
                                expression: runtimeLiteral1,
                            } as any,
                        ],
                        elseBranch: [
                            {
                                type: "ExpressionStatement",
                                expression: runtimeLiteral2,
                            } as any,
                        ],
                    } as any,
                ],
            };

            const result = ASTUtils.findRuntimeLiterals(ast);
            expect(result).toHaveLength(2);
            expect(result).toContain(runtimeLiteral1);
            expect(result).toContain(runtimeLiteral2);
        });
    });

    describe("findConfigFile", () => {
        // Only run this test if not in a restricted environment regarding path/URI
        it("should find config.yml in parent directory", () => {
            const mockExistsSync = fs.existsSync as jest.Mock;
            mockExistsSync.mockImplementation((p: string) => {
                // Determine if path ends with config.yml
                if (p.endsWith("config.yml") && p.includes("project")) {
                    return true;
                }
                return false;
            });

            // Construct a fake file URI
            // On unix: /home/user/project/src/file.lml
            // On win: C:\\Users\\project\\src\\file.lml
            const isWin = path.sep === "\\";
            const projectRoot = isWin
                ? "C:\\Users\\project"
                : "/home/user/project";
            const srcDir = path.join(projectRoot, "src");
            const fileUri = isWin
                ? `file:///C:/Users/project/src/file.lml`
                : `file:///home/user/project/src/file.lml`;

            const configPath = findConfigFile(fileUri);

            expect(configPath).not.toBeNull();
            if (configPath) {
                expect(path.basename(configPath)).toBe("config.yml");
                // Should be in project root
                expect(path.dirname(configPath)).toContain("project");
            }
        });

        it("should return null if no config found", () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const isWin = path.sep === "\\";
            const fileUri = isWin
                ? `file:///C:/Users/other/file.lml`
                : `file:///home/user/other/file.lml`;

            const configPath = findConfigFile(fileUri);
            expect(configPath).toBeNull();
        });
    });
});
