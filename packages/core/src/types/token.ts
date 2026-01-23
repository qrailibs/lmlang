import { FunctionReturnType, Loc } from "./ast";

export enum TokenType {
    // Keywords
    Import = "Import", // import
    From = "From", // from
    Return = "Return", // return
    If = "If", // if
    Else = "Else", // else
    Typeof = "Typeof", // typeof

    // Types
    TypeStr = "TypeStr", // str
    TypeInt = "TypeInt", // int
    TypeDbl = "TypeDbl", // dbl
    TypeBool = "TypeBool", // bool
    TypeObj = "TypeObj", // obj
    TypeNil = "TypeNil", // nil
    TypeFunc = "TypeFunc", // func
    TypeVoid = "TypeVoid", // void
    TypeErr = "TypeErr", // err
    TypeUnknown = "TypeUnknown", // unknown

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
    ModuloOp = "ModuloOp", // %
    MultiplyOp = "MultiplyOp", // *
    ConvertOp = "ConvertOp", // ~
    PlusPlus = "PlusPlus", // ++
    MinusMinus = "MinusMinus", // --

    // Logical & Comparison
    Equal = "Equal", // ==
    NotEqual = "NotEqual", // !=
    Greater = "Greater", // >
    Less = "Less", // <
    GreaterEqual = "GreaterEqual", // >=
    LessEqual = "LessEqual", // <=
    And = "And", // &&
    Or = "Or", // ||
    Bang = "Bang", // !

    // Literals
    StringLiteral = "StringLiteral", // "string"
    IntLiteral = "IntLiteral", // 12345
    DoubleLiteral = "DoubleLiteral", // 12.345
    BoolLiteral = "BoolLiteral", // true

    // Special
    RuntimeBlockBody = "RuntimeBlockBody", // The raw code inside <runtime>...</runtime>

    // End of file
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
