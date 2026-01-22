import { SourceLocation } from "../../types/ast";

export interface BaseStatement {
    kind: string;
    loc?: SourceLocation;
}
