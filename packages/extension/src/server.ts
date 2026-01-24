import * as fs from "fs";
const _fs_duplicate_was_here = 0; // Removed duplicate
import * as path from "path";
import * as yaml from "js-yaml";
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
    DidChangeWatchedFilesNotification,
} from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import {
    CompletionItem,
    CompletionItemKind,
    Hover,
    SignatureHelp,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    Lexer,
    Parser,
    Scanner,
    ProjectConfig,
    findRuntimeLiterals,
    findNodeAt,
    findNodeStack,
} from "@lmlang/core";

import { findConfigFile } from "./utils";

const connection = createConnection(ProposedFeatures.all);

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

    // Register file watchers
    connection.client.register(DidChangeWatchedFilesNotification.type, {
        watchers: [
            { globPattern: "**/*.lml" },
            { globPattern: "**/config.yml" },
        ],
    });
});

connection.onDidChangeWatchedFiles((_change) => {
    connection.console.log("We received an file change event");
    // Re-validate all open documents
    documents.all().forEach(validateTextDocument);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

// Helper to find config file in parent directories
// imported from utils.ts

// Helper to find all RuntimeLiteral nodes in AST
// imported from utils.ts

// Helper to create module loader
function createModuleLoader(
    currentUri: string,
): (path: string, base: string) => string | null {
    return (importPath: string, base: string) => {
        try {
            // Base is URI of current file or simple path
            let basePath = base;
            try {
                if (base.startsWith("file://")) {
                    basePath = URI.parse(base).fsPath;
                }
            } catch (e) {}

            const dir = path.dirname(basePath);
            const resolvedPath = path.resolve(dir, importPath);
            const resolvedUri = URI.file(resolvedPath).toString();

            // Check open documents first
            const doc = documents.get(resolvedUri);
            if (doc) {
                return doc.getText();
            }

            // Read from disk
            return fs.readFileSync(resolvedPath, "utf-8");
        } catch (e) {
            return null;
        }
    };
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    try {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, code);
        const ast = parser.parse();

        // Run Scanner and process structured errors
        const moduleLoader = createModuleLoader(textDocument.uri);
        const scanner = new Scanner(code, moduleLoader, textDocument.uri);
        const result = scanner.scan(ast);
        connection.console.log(
            `[LMLang Server] Scanned. Errors found: ${result.errors.length}`,
        );

        // 1. Core Scanner Errors
        if (result.errors.length > 0) {
            for (const e of result.errors) {
                // Map error to diagnostic
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
                    message: e.rawMessage || e.message,
                    source: "LMLang",
                });
            }
        }

        // 2. Container Validation
        const configPath = findConfigFile(textDocument.uri);
        if (configPath) {
            try {
                const configContent = fs.readFileSync(configPath, "utf-8");
                const config = yaml.load(configContent) as ProjectConfig;

                if (config && config.containers) {
                    const validContainers = Object.keys(config.containers);
                    connection.console.log(
                        `[LMLang Server] Valid containers: ${validContainers.join(", ")}`,
                    );

                    const runtimes = findRuntimeLiterals(ast);
                    for (const rt of runtimes) {
                        if (!validContainers.includes(rt.runtimeName)) {
                            // Report error
                            // Report error
                            let range = {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: 1 },
                            };

                            if (rt.loc) {
                                // AST locs are 1-based, LSP is 0-based
                                const startLine = rt.loc.line - 1;
                                const startChar = rt.loc.col - 1;
                                const endLine = rt.loc.endLine
                                    ? rt.loc.endLine - 1
                                    : startLine;
                                const endChar = rt.loc.endCol
                                    ? rt.loc.endCol - 1
                                    : startChar + 1;

                                range = {
                                    start: {
                                        line: startLine,
                                        character: startChar,
                                    },
                                    end: { line: endLine, character: endChar },
                                };
                            }

                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: range,
                                message: `Container '${rt.runtimeName}' not found in configuration. Valid containers: ${validContainers.join(", ")}`,
                                source: "lmlang/container",
                            });
                        }
                    }
                }
            } catch (e) {
                connection.console.error(`[LMLang Server] Config error: ${e}`);
            }
        } else {
            // Optional: warn if no config found?
            // connection.console.log("[LMLang Server] No config found.");
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
            const moduleLoader = createModuleLoader(document.uri);
            const scanner = new Scanner("", moduleLoader, document.uri);
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
        const parser = new Parser(tokens, text);
        const ast = parser.parse();
        const moduleLoader = createModuleLoader(document.uri);
        const scanner = new Scanner(text, moduleLoader, document.uri);
        scanner.scan(ast); // Populate scope

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
                    let kind: CompletionItemKind = CompletionItemKind.Variable;
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
        const parser = new Parser(tokens, text);
        const ast = parser.parse();
        const moduleLoader = createModuleLoader(document.uri);
        const scanner = new Scanner(text, moduleLoader, document.uri);
        scanner.scan(ast); // Populate scope

        const pos = {
            line: params.position.line + 1,
            col: params.position.character + 1,
        };
        const scope = scanner.getScopeAt(ast, pos);

        // Find the word under cursor is hard without AST node.
        // Use ASTUtils to find node at cursor!
        const node = findNodeAt(ast, pos);

        if (node) {
            let name: string | undefined;

            // 1. Handle VarReference (or similar with varName)
            if ("varName" in node) {
                name = (node as any).varName;
            }
            // 2. Handle CallExpression
            else if ((node as any).type === "CallExpression") {
                // If cursor is on the callee part?
                // For now, assume if we are on CallExpression and NOT on arguments, we are on callee.
                // But findNodeAt dives into arguments. So if we are returned CallExpression, we must be on the callee (or parens).
                name = (node as any).callee;
            }
            // 3. Handle ImportStatement
            else if ((node as any).kind === "ImportStatement") {
                const impStmt = node as any;
                // Find which import we are hovering
                for (const imp of impStmt.imports) {
                    // We don't have exact loc for each import specifier in the current AST :(
                    // But we can check if the name matches the text under cursor?
                    // Or we can just try to see if the word under cursor matches one of the imports.
                    // Let's use the scanner to get the word at position? Or regex?
                    // Simple heuristic: check if `imp.name` or `imp.alias` matches word at cursor.
                }
                // Better: The AST for ImportStatement in this parser seems to be monolithic.
                // If we can't find exact import, we might fail for imports for now or improve Parser to have locs for specifiers.
                // However, the user specifically mentioned "hover on imported function as ... import".

                // Let's try to infer from text.
                const offset = document.offsetAt(params.position);
                // We have to implement getWordAtPosition manually or use regex on line.
                const lineText = text.split("\n")[params.position.line];
                const char = params.position.character;

                // Simple word extraction around cursor
                let start = char;
                while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1]))
                    start--;
                let end = char;
                while (
                    end < lineText.length &&
                    /[a-zA-Z0-9_]/.test(lineText[end])
                )
                    end++;
                const word = lineText.substring(start, end);

                if (
                    impStmt.imports.some(
                        (i: any) => i.name === word || i.alias === word,
                    )
                ) {
                    name = word;
                }
            }

            if (name) {
                // Lookup in scope
                let ctx: any = scope;
                while (ctx) {
                    if (ctx.vars.has(name)) {
                        const type = ctx.vars.get(name);
                        let sigStr = `**${name}**: \`${type}\``;
                        if (type === "func" && ctx.signatures.has(name)) {
                            const sig = ctx.signatures.get(name);
                            sigStr = `**${name}** \`(${sig.params
                                .map((p: any) => `${p.type} ${p.name}`)
                                .join(", ")}): ${sig.returnType}\``;
                            if (sig.description) {
                                sigStr += `\n\n${sig.description}`;
                            }
                            if (sig.params.length > 0) {
                                sigStr += `\n\n**Parameters:**`;
                                for (const p of sig.params) {
                                    sigStr += `\n- \`${p.name}\` (${p.type})`;
                                    if (p.description) {
                                        sigStr += `: ${p.description}`;
                                    }
                                }
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
        const parser = new Parser(tokens, text);
        const ast = parser.parse();
        const moduleLoader = createModuleLoader(document.uri);
        const scanner = new Scanner(text, moduleLoader, document.uri);
        scanner.scan(ast);

        const pos = {
            line: params.position.line + 1,
            col: params.position.character + 1,
        };

        // Find node stack
        const stack = findNodeStack(ast, pos);
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
                                        documentation: p.description,
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
