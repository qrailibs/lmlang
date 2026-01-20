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
    Dot = "Dot", // .
    Comma = "Comma", // ,
    Semicolon = "Semicolon", // ;

    // Math Operators
    PlusOp = "PlusOp", // +
    MinusOp = "MinusOp", // -
    DivideOp = "DivideOp", // /
    MultiplyOp = "MultiplyOp", // *
    ConvertOp = "ConvertOp", // ~

    // Literals
    StringLiteral = "StringLiteral",
    IntLiteral = "IntLiteral",
    DoubleLiteral = "DoubleLiteral",
    BoolLiteral = "BoolLiteral",

    // Special
    RuntimeBlockBody = "RuntimeBlockBody", // The raw code inside <runtime>...</runtime>

    EOF = "EOF",
}
