import { Lexer } from "../src/lexer/Lexer";
import { Parser } from "../src/parser/Parser";
import {
    TypeConversionExpression,
    TypeCheckExpression,
    BinaryExpression,
} from "../src/types/expression";
import { ExpressionStatement } from "../src/parser/statements";

describe("Type Operators", () => {
    test("parse type conversion", () => {
        const input = `100 ~ str;`;
        const lexer = new Lexer(input);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ExpressionStatement;
        expect(stmt.kind).toBe("ExpressionStatement");

        const expr = stmt.expression as TypeConversionExpression;
        expect(expr.type).toBe("TypeConversionExpression");
        expect(expr.targetType).toBe("str");
        expect(expr.value.type).toBe("IntLiteral");
    });

    test("parse type check", () => {
        const input = `type 100;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as TypeCheckExpression;

        expect(expr.type).toBe("TypeCheckExpression");
        expect(expr.value.type).toBe("IntLiteral");
    });

    test("parse nested type conversion", () => {
        const input = `100 ~ int ~ str;`;
        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();

        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as TypeConversionExpression;

        // (100 ~ int) ~ str
        expect(expr.type).toBe("TypeConversionExpression");
        expect(expr.targetType).toBe("str");

        const inner = expr.value as TypeConversionExpression;
        expect(inner.type).toBe("TypeConversionExpression");
        expect(inner.targetType).toBe("int");
    });

    test("precedence: conversion binds tighter than weak arithmetic", () => {
        const input = `100 ~ str + "00";`;
        // Should be (100 ~ str) + "00"

        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as BinaryExpression;

        expect(expr.type).toBe("BinaryExpression");
        expect(expr.operator).toBe("+");
        expect(expr.left.type).toBe("TypeConversionExpression");
    });

    test("precedence: conversion binds tighter than strong arithmetic", () => {
        const input = `100 ~ int * 20;`;
        // Should be (100 ~ int) * 20

        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as BinaryExpression;

        expect(expr.type).toBe("BinaryExpression");
        expect(expr.operator).toBe("*");
        expect(expr.left.type).toBe("TypeConversionExpression");
    });

    test("precedence: type check unary", () => {
        const input = `type 100 + " is correct";`;
        // (type 100) + ...

        const parser = new Parser(new Lexer(input).tokenize(), input);
        const ast = parser.parse();
        const stmt = ast.statements[0] as ExpressionStatement;
        const expr = stmt.expression as BinaryExpression;

        expect(expr.type).toBe("BinaryExpression");
        expect(expr.left.type).toBe("TypeCheckExpression");
    });
});
