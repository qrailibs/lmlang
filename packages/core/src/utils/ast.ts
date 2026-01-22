import { Loc, AST, ASTNode, Statement } from "../types/ast";
import {
    BlockStatement,
    DefStatement,
    AssignmentStatement,
    ExpressionStatement,
    ReturnStatement,
} from "../parser/statements";
import {
    Expression,
    CallExpression,
    BinaryExpression,
    LambdaExpression,
} from "../types/expression";

/**
 * Helper to calculate end loc if missing, for checking "strictly inside"
 * @returns range
 */
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

/**
 * Checks if a location is inside a node's range
 * @returns is inside range
 */
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

/**
 * Finds the deepest node that contains the given location.
 */
export function findNodeAt(ast: AST, loc: Loc): ASTNode | undefined {
    const stack = findNodeStack(ast, loc);
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/**
 * Returns a stack of nodes from root to the leaf node containing the location.
 */
export function findNodeStack(ast: AST, loc: Loc): ASTNode[] {
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
                        findInExpression(def.value, loc, stack);
                        return stack;
                    }
                    // If in name? The name is just a string usually, or identifier node?
                    // In this AST, name is string. So stmt is the leaf for name.
                    return stack;
                } else if (stmt.kind === "AssignmentStatement") {
                    const assign = stmt as AssignmentStatement;
                    if (contains(assign.value, loc)) {
                        findInExpression(assign.value, loc, stack);
                        return stack;
                    }
                    return stack;
                } else if (stmt.kind === "ExpressionStatement") {
                    const exprStmt = stmt as ExpressionStatement;
                    if (contains(exprStmt.expression, loc)) {
                        findInExpression(exprStmt.expression, loc, stack);
                        return stack;
                    }
                    return stack;
                } else if (stmt.kind === "ReturnStatement") {
                    const ret = stmt as ReturnStatement;
                    if (ret.value && contains(ret.value, loc)) {
                        findInExpression(ret.value, loc, stack);
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

export function findInExpression(expr: Expression, loc: Loc, stack: ASTNode[]) {
    stack.push(expr);

    if (expr.type === "BinaryExpression") {
        const bin = expr as BinaryExpression;
        if (contains(bin.left, loc)) {
            findInExpression(bin.left, loc, stack);
        } else if (contains(bin.right, loc)) {
            findInExpression(bin.right, loc, stack);
        }
    } else if (expr.type === "CallExpression") {
        const call = expr as CallExpression;
        // Check args
        for (const arg of call.arguments) {
            if (contains(arg, loc)) {
                findInExpression(arg, loc, stack);
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
                    findInStatements(stmts, loc, stack);
                    return;
                }
            }
        } else if (lambda.body) {
            const bodyExpr = lambda.body as Expression;
            if (contains(bodyExpr, loc)) {
                findInExpression(bodyExpr, loc, stack);
            }
        }
    } else if (expr.type === "TypeConversionExpression") {
        if (contains(expr.value, loc)) {
            findInExpression(expr.value, loc, stack);
        }
    } else if (expr.type === "TypeCheckExpression") {
        if (contains(expr.value, loc)) {
            findInExpression(expr.value, loc, stack);
        }
    } else if (expr.type === "UpdateExpression") {
        // Leaf
    }
    // Literals are leaves
}

export function findInStatements(
    stmts: Statement[],
    loc: Loc,
    stack: ASTNode[],
) {
    for (const stmt of stmts) {
        if (contains(stmt, loc)) {
            stack.push(stmt);

            if (stmt.kind === "BlockStatement") {
                findInStatements(
                    (stmt as BlockStatement).statements,
                    loc,
                    stack,
                );
            } else if (stmt.kind === "DefStatement") {
                const def = stmt as DefStatement;
                if (contains(def.value, loc))
                    findInExpression(def.value, loc, stack);
            } else if (stmt.kind === "AssignmentStatement") {
                const assign = stmt as AssignmentStatement;
                if (contains(assign.value, loc))
                    findInExpression(assign.value, loc, stack);
            } else if (stmt.kind === "ExpressionStatement") {
                const es = stmt as ExpressionStatement;
                if (contains(es.expression, loc))
                    findInExpression(es.expression, loc, stack);
            } else if (stmt.kind === "ReturnStatement") {
                const ret = stmt as ReturnStatement;
                if (ret.value && contains(ret.value, loc))
                    findInExpression(ret.value, loc, stack);
            }
            return;
        }
    }
}

/**
 * Traverses the AST to find all RuntimeLiteral nodes.
 */
export function findRuntimeLiterals(node: ASTNode | AST): any[] {
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
        if (n.body && (Array.isArray(n.body) || typeof n.body === "object")) {
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
