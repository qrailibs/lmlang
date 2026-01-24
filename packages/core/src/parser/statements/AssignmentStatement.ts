import { BaseStatement } from "./BaseStatement";
import { Expression } from "../../types/expression";
import { SourceLocation } from "../../types/ast";

export class AssignmentStatement implements BaseStatement {
    kind = "AssignmentStatement" as const;

    constructor(
        public assignee: Expression,
        public value: Expression,
        public loc: SourceLocation,
    ) {}
}
