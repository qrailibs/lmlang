export interface BaseStatement {
    kind: string;
    loc?: { line: number; col: number };
}
