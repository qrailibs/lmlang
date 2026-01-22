import { FunctionReturnType, Loc } from "./ast";

export enum TokenType {
    // Keywords
    Import = "Import",
    From = "From",
    Return = "Return",
    Type = "Type", // type

    // Types
    TypeStr = "TypeStr",
    TypeInt = "TypeInt",
    TypeDbl = "TypeDbl",
    TypeBool = "TypeBool",
    TypeObj = "TypeObj",
    TypeNil = "TypeNil",
    TypeFunc = "TypeFunc",
    TypeVoid = "TypeVoid",
    TypeErr = "TypeErr",
    TypeUnknown = "TypeUnknown",

    // Identifiers
    Identifier = "Identifier",

    // Operators & Symbols
    Equals = "Equals", // =
    LBrace = "LBrace", // {
    RBrace = "RBrace", // }
    LParen = "LParen", // (
    RParen = "RParen", // )
    LAngle = "LAngle", // <
    RAngle = "RAngle", // >
    Arrow = "Arrow", // =>
    Colon = "Colon", // :
    Dot = "Dot", // .
    Comma = "Comma", // ,
    Semicolon = "Semicolon", // ;

    // Math Operators
    PlusOp = "PlusOp", // +
    MinusOp = "MinusOp", // -
    DivideOp = "DivideOp", // /
    MultiplyOp = "MultiplyOp", // *
    ConvertOp = "ConvertOp", // ~
    PlusPlus = "PlusPlus", // ++
    MinusMinus = "MinusMinus", // --

    // Literals
    StringLiteral = "StringLiteral",
    IntLiteral = "IntLiteral",
    DoubleLiteral = "DoubleLiteral",
    BoolLiteral = "BoolLiteral",

    // Special
    RuntimeBlockBody = "RuntimeBlockBody", // The raw code inside <runtime>...</runtime>

    EOF = "EOF",
}

export type Token = {
    type: TokenType;

    value: string;
} & Loc;

export const TOKEN_TO_VAR_TYPE: Record<string, FunctionReturnType> = {
    [TokenType.TypeStr]: "str",
    [TokenType.TypeInt]: "int",
    [TokenType.TypeDbl]: "dbl",
    [TokenType.TypeBool]: "bool",
    [TokenType.TypeObj]: "obj",
    [TokenType.TypeNil]: "nil",
    [TokenType.TypeFunc]: "func",
    [TokenType.TypeVoid]: "void",
    [TokenType.TypeErr]: "err",
    [TokenType.TypeUnknown]: "unknown",
};

export const TYPE_TOKENS = Object.keys(TOKEN_TO_VAR_TYPE) as TokenType[];
