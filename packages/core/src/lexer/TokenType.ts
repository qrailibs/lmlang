export enum TokenType {
    // Keywords
    Import = "Import",
    From = "From",
    Return = "Return",

    // Types
    TypeStr = "TypeStr",
    TypeObj = "TypeObj",
    TypeInt = "TypeInt",
    TypeDbl = "TypeDbl",
    TypeBool = "TypeBool",

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
    DivideOp = "DivideOp", // / (was Slash)
    Dot = "Dot", // .
    Semicolon = "Semicolon", // ;

    // Math Operators
    PlusOp = "PlusOp", // +
    MinusOp = "MinusOp", // -
    MultiplyOp = "MultiplyOp", // *

    // Literals
    StringLiteral = "StringLiteral",
    IntLiteral = "IntLiteral",
    DoubleLiteral = "DoubleLiteral",
    BoolLiteral = "BoolLiteral",

    // Special
    RuntimeBlockBody = "RuntimeBlockBody", // The raw code inside <runtime>...</runtime>

    EOF = "EOF",
}
