import { Statement } from "./statements";

export interface AST {
    statements: Statement[];
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

export { Expression } from "./expressions";
