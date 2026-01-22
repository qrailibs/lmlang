import { SourceLocation } from "../../types/ast";
import { Expression } from "../../types/expression";

export interface ReturnStatement {
    kind: "ReturnStatement";
    value?: Expression;
    loc: SourceLocation;
}
