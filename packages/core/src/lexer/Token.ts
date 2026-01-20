import { TokenType } from "./TokenType";

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
    length?: number;
}
