import { Lexer } from "./lexer/Lexer";
import { Parser } from "./parser/Parser";
import { Scanner } from "./scanner/Scanner";
import { Interpreter } from "./interpreter/Interpreter";

export { Lexer } from "./lexer/Lexer";
export { Parser } from "./parser/Parser";
export { Interpreter } from "./interpreter/Interpreter";
export { TokenType } from "./lexer/TokenType";
export * from "./parser/types";
export * from "./parser/statements";
export * from "./parser/expressions";
export { Orchestrator } from "./orchestrator/Orchestrator";
export * from "./orchestrator/Config";
export * from "./orchestrator/container/IRuntimeContainer";

export * from "./scanner/Scanner";
export { LmlangError, makeError } from "./utils/Error";

export async function interpret(code: string): Promise<void> {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const scanner = new Scanner(code);
    scanner.scan(ast);

    const interpreter = new Interpreter();
    await interpreter.run(ast, code);
}
