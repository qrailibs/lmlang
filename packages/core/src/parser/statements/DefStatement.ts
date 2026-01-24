import { BaseStatement } from "./BaseStatement";
import { Expression } from "../../types/expression";
import { VariableType, SourceLocation } from "../../types/ast";

export class DefStatement implements BaseStatement {
    kind = "DefStatement";
    constructor(
        public name: string,
        public value: Expression,
        public varType: VariableType,
        public loc?: SourceLocation,
        public isExported: boolean = false,
    ) {}
}
