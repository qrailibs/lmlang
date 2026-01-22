import { BaseStatement } from "./BaseStatement";
import { Expression } from "../../types/expression";

export interface ExpressionStatement extends BaseStatement {
    kind: "ExpressionStatement";
    expression: Expression;
}
