import { SourceLocation } from "../types";
import { Expression } from "../expressions";

export interface ReturnStatement {
    kind: "ReturnStatement";
    value?: Expression;
    loc: SourceLocation;
}
