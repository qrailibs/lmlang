import { SourceLocation } from "../types";

export interface BaseStatement {
    kind: string;
    loc?: SourceLocation;
}
