import { BaseStatement } from "./BaseStatement";
import { Expression } from "../../types/expression";
import { Statement, SourceLocation } from "../../types/ast";

export class IfStatement implements BaseStatement {
    kind: "IfStatement" = "IfStatement";

    constructor(
        public condition: Expression,
        public thenBranch: Statement,
        public elseBranch: Statement | undefined,
        public loc: SourceLocation,
    ) {}
}
