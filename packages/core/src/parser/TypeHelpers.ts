import { TokenType } from "../lexer/TokenType";
import { VariableType } from "./types";

export const TOKEN_TO_VAR_TYPE: Record<string, VariableType> = {
    [TokenType.TypeStr]: "str",
    [TokenType.TypeInt]: "int",
    [TokenType.TypeDbl]: "dbl",
    [TokenType.TypeBool]: "bool",
    [TokenType.TypeObj]: "obj",
    [TokenType.TypeNil]: "nil",
    [TokenType.TypeFunc]: "func",
    [TokenType.TypeErr]: "err",
    [TokenType.TypeUnknown]: "unknown",
};

export const TYPE_TOKENS = Object.keys(TOKEN_TO_VAR_TYPE) as TokenType[];
