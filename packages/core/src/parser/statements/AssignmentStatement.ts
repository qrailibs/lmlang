import { BaseStatement } from "./BaseStatement";
import { Expression } from "../expressions";
import { SourceLocation } from "../types";

export class AssignmentStatement implements BaseStatement {
    kind = "AssignmentStatement" as const;

    constructor(
        public name: string,
        public value: Expression,
        public loc: SourceLocation,
    ) {}
}
