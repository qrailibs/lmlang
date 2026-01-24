import {
    AssignmentStatement,
    BlockStatement,
    DefStatement,
    ExpressionStatement,
    ImportStatement,
    ReturnStatement,
    IfStatement,
} from "../parser/statements";
import { Expression } from "./expression";

export type Statement =
    | DefStatement
    | ImportStatement
    | ExpressionStatement
    | ReturnStatement
    | BlockStatement
    | AssignmentStatement
    | IfStatement;

export interface Loc {
    line: number;
    col: number;
    length?: number;
}

export type ASTNode = Statement | Expression;

export interface AST {
    statements: Statement[];
}

import {
    VariableType,
    PrimitiveType,
    FunctionSignature,
} from "@lmlang/library";

export interface SourceLocation {
    line: number;
    col: number;
    len?: number; // Kept for backward compat/convenience
    endLine: number;
    endCol: number;
}

export { VariableType, PrimitiveType, FunctionSignature };

export type FunctionReturnType = VariableType | "void";
