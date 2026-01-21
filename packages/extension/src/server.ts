import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer, LmlangError, Parser, Scanner, ASTUtils } from "@lmlang/core";
import {
    CompletionItem,
    CompletionItemKind,
    Hover,
    SignatureHelp,
} from "vscode-languageserver";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: [".", '"', "/"],
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ["(", ","],
            },
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined,
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log("Workspace folder change event received.");
        });
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    try {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();

        // Run Scanner and process structured errors
        const scanner = new Scanner(code);
        const result = scanner.scan(ast);
        connection.console.log(
            `[LMLang Server] Scanned. Errors found: ${result.errors.length}`,
        );

        if (result.errors.length > 0) {
            for (const e of result.errors) {
                let range = {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 },
                };

                if (
                    e.loc &&
                    typeof e.loc.line === "number" &&
                    typeof e.loc.col === "number"
                ) {
                    const startLine = e.loc.line - 1;
                    const startChar = e.loc.col - 1;
                    const endLine = e.loc.endLine
                        ? e.loc.endLine - 1
                        : startLine;
                    const endChar = e.loc.endCol
                        ? e.loc.endCol - 1
                        : startChar + (e.loc.len || 1);

                    range = {
                        start: {
                            line: startLine,
                            character: startChar,
                        },
                        end: {
                            line: endLine,
                            character: endChar,
                        },
                    };
                }

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: range,
                    message: e.rawMessage || e.message, // rawMessage for short, message for long
                    source: "LMLang",
                });
            }
        }
    } catch (e: unknown) {
        connection.console.error(`[LMLang Server] Validation Error: ${e}`);
        const err = e as any;

        // Structured LmlangError
        if (err.name === "LmlangError" || "rawMessage" in err) {
            const message = err.rawMessage || "Unknown error";
            let range = {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
            };

            if (
                err.loc &&
                typeof err.loc.line === "number" &&
                typeof err.loc.col === "number"
            ) {
                const startLine = err.loc.line - 1;
                const startChar = err.loc.col - 1;
                const endLine = err.loc.endLine
                    ? err.loc.endLine - 1
                    : startLine;
                const endChar = err.loc.endCol
                    ? err.loc.endCol - 1
                    : startChar + (err.loc.len || 1);

                range = {
                    start: {
                        line: startLine,
                        character: startChar,
                    },
                    end: {
                        line: endLine,
                        character: endChar,
                    },
                };
            }

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: message,
                source: "lmlang/scan",
            });
        } else {
            // Generic JS Error (Lexer errors, crashes, etc)
            // Report as error at top of file or wherever reasonable
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 },
                },
                message: `Internal Error: ${err.message || String(err)}`,
                source: "lmlang/scan",
            });
        }
    }

    // Send the diagnostics to the client.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Completion Handler
connection.onCompletion((textDocumentPosition): CompletionItem[] => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
    const linePrefix = text.substring(0, offset).split("\n").pop()!;

    // 1. Module Name Completion: from "..."
    const fromMatch = linePrefix.match(/from\s+["']([^"']*)$/);
    if (fromMatch) {
        try {
            const scanner = new Scanner(""); // Empty source just to access methods? Or use cached?
            // Scanner constructs with source.
            // But methods are instance methods.
            // Ideally should be static or accessible.
            // But Scanner depends on 'packages' imported in its file.
            // So instance is fine.
            return scanner.getAvailableModules().map((pkg) => ({
                label: pkg,
                kind: CompletionItemKind.Module,
                detail: "LMLang Standard Library",
            }));
        } catch (e) {
            return [];
        }
    }

    // 2. Import Specifier Completion: import { ... } from "..."
    const fullLine = text.split("\n")[textDocumentPosition.position.line];
    const importMatch = fullLine.match(
        /import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/,
    );
    if (importMatch) {
        const moduleName = importMatch[2];
        // Check cursor inside braces...
        if (
            linePrefix.lastIndexOf("{") > linePrefix.lastIndexOf("}") ||
            (linePrefix.includes("{") && !linePrefix.includes("}"))
        ) {
            try {
                const scanner = new Scanner("");
                const exports = scanner.getModuleExports(moduleName);
                if (exports) {
                    return Object.keys(exports).map((exp) => ({
                        label: exp,
                        kind: CompletionItemKind.Function,
                        detail: `Import from ${moduleName}`,
                    }));
                }
            } catch (e) {}
        }
    }

    // 3. Scope Completion
    // Parse and scan
    try {
        const lexer = new Lexer(text);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const scanner = new Scanner(text);

        // Loc is 0-indexed in Scanner/AST?
        // textDocumentPosition.position.line is 0-indexed.
        const scope = scanner.getScopeAt(ast, {
            line: textDocumentPosition.position.line,
            col: textDocumentPosition.position.character,
        });

        const items: CompletionItem[] = [];

        // Helper to collect from scope up to root
        let ctx: any = scope;
        while (ctx) {
            for (const [name, type] of ctx.vars) {
                // duplicate check?
                if (!items.some((i) => i.label === name)) {
                    let kind = CompletionItemKind.Variable;
                    let detail = type;
                    if (type === "func") {
                        kind = CompletionItemKind.Function;
                        const sig = ctx.signatures.get(name);
                        if (sig) {
                            detail = `(${sig.params
                                .map((p: any) => `${p.type} ${p.name}`)
                                .join(", ")}): ${sig.returnType}`;
                        }
                    }
                    items.push({
                        label: name,
                        kind,
                        detail: detail,
                    });
                }
            }
            ctx = ctx.parent;
        }

        // Add built-in keywords or types?
        const keywords = [
            "int",
            "str",
            "dbl",
            "bool",
            "func",
            "return",
            "if",
            "def",
        ]; // def is deprecated/removed? No, int/str/etc are types.
        // Actually keywords in TokenTypes: Import, From, Return.
        // And Types.
        [
            "int",
            "str",
            "dbl",
            "bool",
            "obj",
            "nil",
            "func",
            "void",
            "import",
            "from",
            "return",
            "true",
            "false",
        ].forEach((k) => {
            if (!items.some((i) => i.label === k)) {
                items.push({ label: k, kind: CompletionItemKind.Keyword });
            }
        });

        return items;
    } catch (e) {
        return [];
    }
});

// Handle completion resolve (required if resolveProvider: true)
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
});

// Hover Handler
connection.onHover((params): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const text = document.getText();

    try {
        const lexer = new Lexer(text);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const scanner = new Scanner(text);

        const pos = {
            line: params.position.line,
            col: params.position.character,
        };
        const scope = scanner.getScopeAt(ast, pos);

        // Find the word under cursor is hard without AST node.
        // Use ASTUtils to find node at cursor!
        const node = ASTUtils.findNodeAt(ast, pos);

        if (node) {
            // If node is VarReference or similar
            if ("varName" in node) {
                const name = (node as any).varName;
                // Lookup in scope
                let ctx: any = scope;
                while (ctx) {
                    if (ctx.vars.has(name)) {
                        const type = ctx.vars.get(name);
                        let sigStr = `**${name}**: \`${type}\``;
                        if (type === "func" && ctx.signatures.has(name)) {
                            const sig = ctx.signatures.get(name);
                            sigStr = `**${name}**\n\n\`(${sig.params
                                .map((p: any) => `${p.type} ${p.name}`)
                                .join(", ")}): ${sig.returnType}\``;
                            if (sig.description) {
                                sigStr += `\n\n${sig.description}`;
                            }
                        }
                        return {
                            contents: {
                                kind: "markdown",
                                value: sigStr,
                            },
                        };
                    }
                    ctx = ctx.parent;
                }
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
});

// Signature Help
connection.onSignatureHelp((params): SignatureHelp | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const text = document.getText();

    try {
        const lexer = new Lexer(text);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const scanner = new Scanner(text);

        const pos = {
            line: params.position.line,
            col: params.position.character,
        };

        // Find node stack
        const stack = ASTUtils.findNodeStack(ast, pos);
        // Look for call expression in stack (closest to top)
        for (let i = stack.length - 1; i >= 0; i--) {
            const node = stack[i];
            if ((node as any).type === "CallExpression") {
                const call = node as any; // CallExpression
                // We need to resolve the callee
                const callee = call.callee;
                // We need scope at the call site
                const scope = scanner.getScopeAt(ast, pos);

                // Lookup callee signature
                let ctx: any = scope;
                while (ctx) {
                    if (ctx.signatures.has(callee)) {
                        const sig = ctx.signatures.get(callee);

                        // Determine active parameter
                        // Check which argument range contains cursor?
                        // AST locs are start/end.
                        let activeParameter = 0;
                        // Simple heuristic: count commas before cursor inside parens?
                        // Or verify args locs.
                        // But if we are typing new arg, it might not be in AST yet or AST is partial.
                        // Relying on AST might be flaky for active param during typing.
                        // But let's try AST first.

                        // If we are in `arguments` array
                        // But AST might be stale if `(` was just typed and not parsed as CallExpression yet?
                        // If Parser handles incomplete call, fine.

                        // Let's assume parsed correctly.
                        if (call.arguments) {
                            for (let j = 0; j < call.arguments.length; j++) {
                                const arg = call.arguments[j];
                                if (
                                    arg.loc &&
                                    pos.col >= arg.loc.col &&
                                    pos.col <= arg.loc.endCol
                                ) {
                                    activeParameter = j;
                                    break;
                                }
                                // If cursor is after this arg (and before next), it's next.
                                // But commas separate.
                                if (arg.loc && pos.col > arg.loc.endCol) {
                                    activeParameter = j + 1;
                                }
                            }
                        }

                        return {
                            signatures: [
                                {
                                    label: `${callee}(${sig.params.map((p: any) => `${p.type} ${p.name}`).join(", ")})`,
                                    parameters: sig.params.map((p: any) => ({
                                        label: `${p.type} ${p.name}`,
                                    })),
                                    documentation: sig.description,
                                },
                            ],
                            activeSignature: 0,
                            activeParameter,
                        };
                    }
                    ctx = ctx.parent;
                }
                break;
            }
        }
    } catch (e) {}
    return null;
});

documents.listen(connection);
connection.listen();
