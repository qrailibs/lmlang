import { AST, ASTNode } from "../parser/types";
import {
    Statement,
    BlockStatement,
    DefStatement,
    AssignmentStatement,
    ExpressionStatement,
    ImportStatement,
    ReturnStatement,
} from "../parser/statements";
import {
    Expression,
    CallExpression,
    BinaryExpression,
    LambdaExpression,
} from "../parser/expressions";

export interface Loc {
    line: number;
    col: number;
}

function isInside(node: ASTNode, loc: Loc): boolean {
    if (!node.loc) return false;
    // Simple check: start <= loc
    // We need end location in AST for perfect check, but let's assume if it starts before, it *might* be inside.
    // However, without end location it's hard.
    // Wait, the Parser/Lexer usually gives loc with len or end/start.
    // Let's check ASTNode definition again via context or assume standard.
    // Looking at previous Scanner.ts view:
    // e.loc has line, col, endLine, endCol, len.

    // Let's assume standardized ASTNode from parser/types has these.
    // If not, we might need to rely on what is available.

    const startLine = node.loc.line;
    const startCol = node.loc.col;

    // If loc is before start, definitely not inside
    if (loc.line < startLine) return false;
    if (loc.line === startLine && loc.col < startCol) return false;

    // Check end if available
    if (node.loc.endLine !== undefined && node.loc.endCol !== undefined) {
        if (loc.line > node.loc.endLine) return false;
        if (loc.line === node.loc.endLine && loc.col > node.loc.endCol)
            return false;
    } else if (node.loc.len !== undefined) {
        // Single line assumption if only len is provided?
        // This is risky if multi-line.
        // But let's check Scanner.ts line 114: it calculates endLine/endChar for diagnostics.
        // It seems reliable.
    }

    return true;
}

// Helper to calculate end loc if missing, for checking "strictly inside"
function getRange(node: ASTNode): { start: Loc; end: Loc } {
    const start = { line: node.loc?.line || 0, col: node.loc?.col || 0 };
    let end = {
        line: node.loc?.endLine || start.line,
        col: node.loc?.endCol || start.col,
    };

    if (node.loc?.len && !node.loc.endLine) {
        end.col += node.loc.len;
    }

    return { start, end };
}

function contains(node: ASTNode, loc: Loc): boolean {
    if (!node.loc) return false;
    const r = getRange(node);

    // Check after start
    if (loc.line < r.start.line) return false;
    if (loc.line === r.start.line && loc.col < r.start.col) return false;

    // Check before end
    if (loc.line > r.end.line) return false;
    if (loc.line === r.end.line && loc.col > r.end.col) return false;

    return true;
}

export class ASTUtils {
    /**
     * Finds the deepest node that contains the given location.
     */
    public static findNodeAt(ast: AST, loc: Loc): ASTNode | undefined {
        const stack = this.findNodeStack(ast, loc);
        return stack.length > 0 ? stack[stack.length - 1] : undefined;
    }

    /**
     * Returns a stack of nodes from root to the leaf node containing the location.
     */
    public static findNodeStack(ast: AST, loc: Loc): ASTNode[] {
        const stack: ASTNode[] = [];

        // Root is the list of statements in AST
        // We iterate and dive into the one that contains loc

        let currentStatements: Statement[] = ast.statements;

        while (true) {
            let found = false;
            for (const stmt of currentStatements) {
                if (contains(stmt, loc)) {
                    stack.push(stmt);
                    found = true;

                    // Dive into statement children
                    if (stmt.kind === "BlockStatement") {
                        currentStatements = (stmt as BlockStatement).statements;
                        // Continue outer loop with new statements
                    } else if (stmt.kind === "DefStatement") {
                        const def = stmt as DefStatement;
                        // check value expression
                        if (contains(def.value, loc)) {
                            // Dive into expression
                            this.findInExpression(def.value, loc, stack);
                            return stack;
                        }
                        // If in name? The name is just a string usually, or identifier node?
                        // In this AST, name is string. So stmt is the leaf for name.
                        return stack;
                    } else if (stmt.kind === "AssignmentStatement") {
                        const assign = stmt as AssignmentStatement;
                        if (contains(assign.value, loc)) {
                            this.findInExpression(assign.value, loc, stack);
                            return stack;
                        }
                        return stack;
                    } else if (stmt.kind === "ExpressionStatement") {
                        const exprStmt = stmt as ExpressionStatement;
                        if (contains(exprStmt.expression, loc)) {
                            this.findInExpression(
                                exprStmt.expression,
                                loc,
                                stack,
                            );
                            return stack;
                        }
                        return stack;
                    } else if (stmt.kind === "ReturnStatement") {
                        const ret = stmt as ReturnStatement;
                        if (ret.value && contains(ret.value, loc)) {
                            this.findInExpression(ret.value, loc, stack);
                            return stack;
                        }
                        return stack;
                    } else if (stmt.kind === "ImportStatement") {
                        return stack;
                    }

                    // If we found a block, we broke specifically to continue loop
                    if (stmt.kind === "BlockStatement") {
                        break;
                    }

                    // If we are here, we matched a statement but it's not a container we dive into (or we already returned)
                    return stack;
                }
            }

            if (!found) {
                // If we didn't find any statement in the current list that contains loc, stop.
                break;
            }
            // If we found a BlockStatement, we continue properly due to `break` inside loop + `found=true`
        }

        return stack;
    }

    private static findInExpression(
        expr: Expression,
        loc: Loc,
        stack: ASTNode[],
    ) {
        stack.push(expr);

        if (expr.type === "BinaryExpression") {
            const bin = expr as BinaryExpression;
            if (contains(bin.left, loc)) {
                this.findInExpression(bin.left, loc, stack);
            } else if (contains(bin.right, loc)) {
                this.findInExpression(bin.right, loc, stack);
            }
        } else if (expr.type === "CallExpression") {
            const call = expr as CallExpression;
            // Check args
            for (const arg of call.arguments) {
                if (contains(arg, loc)) {
                    this.findInExpression(arg, loc, stack);
                    return;
                }
            }
            // If in callee (string currently), we are at CallExpression
        } else if (expr.type === "LambdaExpression") {
            const lambda = expr as LambdaExpression;
            // Check body
            if (Array.isArray(lambda.body)) {
                // Block body - duplicate logic from finding in statements
                // Copied logic simplified:
                const stmts = lambda.body;
                for (const s of stmts) {
                    if (contains(s, loc)) {
                        // Allow recursion for statements
                        // Since we don't have a unified "findInNode" that handles both Stmt and Expr cleanly without circular dep issues or repetitive code,
                        // we'll just recurse somewhat manually or make `findNodeStack` more generic.
                        // Ideally `findNodeStack` could take a `statements` arg.
                        // But for now let's just push and handle.

                        // Because findNodeStack starts from root AST, we can't reuse it easily without refactor.
                        // Let's implement a `findInStatements` helper.
                        this.findInStatements(stmts, loc, stack);
                        return;
                    }
                }
            } else if (lambda.body) {
                const bodyExpr = lambda.body as Expression;
                if (contains(bodyExpr, loc)) {
                    this.findInExpression(bodyExpr, loc, stack);
                }
            }
        } else if (expr.type === "TypeConversionExpression") {
            if (contains(expr.value, loc)) {
                this.findInExpression(expr.value, loc, stack);
            }
        } else if (expr.type === "TypeCheckExpression") {
            if (contains(expr.value, loc)) {
                this.findInExpression(expr.value, loc, stack);
            }
        } else if (expr.type === "UpdateExpression") {
            // Leaf
        }
        // Literals are leaves
    }

    private static findInStatements(
        stmts: Statement[],
        loc: Loc,
        stack: ASTNode[],
    ) {
        for (const stmt of stmts) {
            if (contains(stmt, loc)) {
                stack.push(stmt);

                if (stmt.kind === "BlockStatement") {
                    this.findInStatements(
                        (stmt as BlockStatement).statements,
                        loc,
                        stack,
                    );
                } else if (stmt.kind === "DefStatement") {
                    const def = stmt as DefStatement;
                    if (contains(def.value, loc))
                        this.findInExpression(def.value, loc, stack);
                } else if (stmt.kind === "AssignmentStatement") {
                    const assign = stmt as AssignmentStatement;
                    if (contains(assign.value, loc))
                        this.findInExpression(assign.value, loc, stack);
                } else if (stmt.kind === "ExpressionStatement") {
                    const es = stmt as ExpressionStatement;
                    if (contains(es.expression, loc))
                        this.findInExpression(es.expression, loc, stack);
                } else if (stmt.kind === "ReturnStatement") {
                    const ret = stmt as ReturnStatement;
                    if (ret.value && contains(ret.value, loc))
                        this.findInExpression(ret.value, loc, stack);
                }
                return;
            }
        }
    }

    /**
     * Traverses the AST to find all RuntimeLiteral nodes.
     */
    public static findRuntimeLiterals(node: ASTNode | AST): any[] {
        const results: any[] = [];

        function visit(n: any) {
            if (!n) return;

            if (n.type === "RuntimeLiteral" || n.kind === "RuntimeLiteral") {
                results.push(n);
            }

            if (n.statements && Array.isArray(n.statements)) {
                n.statements.forEach(visit);
            }
            if (n.value && typeof n.value === "object") {
                visit(n.value);
            }
            if (n.expression && typeof n.expression === "object") {
                visit(n.expression);
            }
            if (n.left && typeof n.left === "object") {
                visit(n.left);
            }
            if (n.right && typeof n.right === "object") {
                visit(n.right);
            }
            if (
                n.body &&
                (Array.isArray(n.body) || typeof n.body === "object")
            ) {
                if (Array.isArray(n.body)) n.body.forEach(visit);
                else visit(n.body);
            }
            if (n.attributes && typeof n.attributes === "object") {
                Object.values(n.attributes).forEach(visit);
            }
            if (n.arguments && Array.isArray(n.arguments)) {
                n.arguments.forEach(visit);
            }
            if (n.thenBranch && Array.isArray(n.thenBranch)) {
                n.thenBranch.forEach(visit);
            }
            if (n.elseBranch && Array.isArray(n.elseBranch)) {
                n.elseBranch.forEach(visit);
            }
        }

        // Start with root statements
        if ((node as AST).statements) {
            (node as AST).statements.forEach(visit);
        } else {
            visit(node);
        }

        return results;
    }
}
