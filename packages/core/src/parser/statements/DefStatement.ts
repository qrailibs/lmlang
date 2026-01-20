import { BaseStatement } from "./BaseStatement";
import { Expression } from "../expressions";
import { VariableType, SourceLocation } from "../types";

export class DefStatement implements BaseStatement {
    kind = "DefStatement";
    constructor(
        public name: string,
        public value: Expression,
        public varType: VariableType,
        public loc?: SourceLocation,
    ) {}
}
