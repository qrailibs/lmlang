import {
    FunctionReturnType,
    SourceLocation,
    Statement,
    VariableType,
} from "./ast";

export type Expression =
    | {
          type: "StringLiteral";
          value: string;
          loc?: SourceLocation;
      }
    | { type: "IntLiteral"; value: number; loc?: SourceLocation }
    | {
          type: "DoubleLiteral";
          value: number;
          loc?: SourceLocation;
      }
    | {
          type: "BoolLiteral";
          value: boolean;
          loc?: SourceLocation;
      }
    | {
          type: "VarReference";
          varName: string;
          loc?: SourceLocation;
      }
    | LambdaExpression
    | RuntimeLiteral
    | CallExpression
    // Operations
    | BinaryExpression
    | TypeCheckExpression
    | UnaryExpression
    | TypeConversionExpression
    | UpdateExpression;

export interface UpdateExpression {
    type: "UpdateExpression";
    operator: "++" | "--";
    varName: string;
    prefix: boolean;
    loc?: SourceLocation;
}

export interface LambdaExpression {
    type: "LambdaExpression";
    params: { name: string; type: VariableType }[];
    returnType: FunctionReturnType;
    body: Expression | Statement[]; // One expression or block
    loc?: SourceLocation;
}

export interface BinaryExpression {
    type: "BinaryExpression";
    operator:
        | "+"
        | "-"
        | "*"
        | "/"
        | "%"
        | "=="
        | "!="
        | "<"
        | "<="
        | ">"
        | ">="
        | "&&"
        | "||";
    left: Expression;
    right: Expression;
    loc?: SourceLocation;
}

export interface UnaryExpression {
    type: "UnaryExpression";
    operator: "!";
    value: Expression;
    loc?: SourceLocation;
}

export interface TypeConversionExpression {
    type: "TypeConversionExpression";
    value: Expression;
    targetType: VariableType;
    loc?: SourceLocation;
}

export interface TypeCheckExpression {
    type: "TypeCheckExpression";
    value: Expression;
    loc?: SourceLocation;
}

export interface CallExpression {
    type: "CallExpression";
    callee: string;
    arguments: Expression[];
    loc?: SourceLocation;
}

export interface RuntimeLiteral {
    type: "RuntimeLiteral";
    runtimeName: string;
    attributes: Record<string, Expression>;
    code: string;
    loc?: SourceLocation;
}
