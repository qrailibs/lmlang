import { Statement } from "./statements";
import { Expression } from "./expressions";

export type ASTNode = Statement | Expression;

export interface AST {
    statements: Statement[];
}

export interface SourceLocation {
    line: number;
    col: number;
    len?: number; // Kept for backward compat/convenience
    endLine: number;
    endCol: number;
}

export type VariableType =
    | "str"
    | "int"
    | "dbl"
    | "bool"
    | "obj"
    | "nil"
    | "func"
    | "err"
    | "unknown";

export type FunctionReturnType = VariableType | "void";

export { Expression } from "./expressions";
