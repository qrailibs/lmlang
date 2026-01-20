import { Statement } from "./statements";

export interface AST {
    statements: Statement[];
}

export type VariableType = "str" | "int" | "obj" | "dbl" | "bool";

export { Expression } from "./expressions";
