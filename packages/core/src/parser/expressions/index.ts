export type Expression =
    | {
          type: "StringLiteral";
          value: string;
          loc?: { line: number; col: number };
      }
    | { type: "IntLiteral"; value: number; loc?: { line: number; col: number } }
    | {
          type: "DoubleLiteral";
          value: number;
          loc?: { line: number; col: number };
      }
    | {
          type: "BoolLiteral";
          value: boolean;
          loc?: { line: number; col: number };
      }
    | {
          type: "VarReference";
          varName: string;
          loc?: { line: number; col: number };
      }
    | RuntimeLiteral
    | CallExpression
    | BinaryExpression;

export interface BinaryExpression {
    type: "BinaryExpression";
    operator: "+" | "-" | "*" | "/";
    left: Expression;
    right: Expression;
    loc?: { line: number; col: number };
}

export interface CallExpression {
    type: "CallExpression";
    callee: string;
    arguments: Expression[];
    loc?: { line: number; col: number };
}

export interface RuntimeLiteral {
    type: "RuntimeLiteral";
    runtimeName: string;
    attributes: Record<string, Expression>;
    code: string;
    loc?: { line: number; col: number };
}
