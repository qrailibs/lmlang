import { SourceLocation, Statement } from "../../types/ast";

export interface BlockStatement {
    kind: "BlockStatement";
    statements: Statement[];
    loc: SourceLocation;
}
