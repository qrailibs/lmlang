import { BaseStatement } from "./BaseStatement";
import { Expression } from "../expressions";

export interface ExpressionStatement extends BaseStatement {
    kind: "ExpressionStatement";
    expression: Expression;
}
