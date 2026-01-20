import { SourceLocation } from "../types";
import { Statement } from "./index";

export interface BlockStatement {
    kind: "BlockStatement";
    statements: Statement[];
    loc: SourceLocation;
}
