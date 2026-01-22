import {
    AssignmentStatement,
    BlockStatement,
    DefStatement,
    ExpressionStatement,
    ImportStatement,
    ReturnStatement,
} from "../parser/statements";
import { Expression } from "./expression";

export type Statement =
    | DefStatement
    | ImportStatement
    | ExpressionStatement
    | ReturnStatement
    | BlockStatement
    | AssignmentStatement;

export interface Loc {
    line: number;
    col: number;
    length?: number;
}

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
