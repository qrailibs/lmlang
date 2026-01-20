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
import { Lexer, LmlangError, Parser, Scanner } from "@lmlang/core";

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
            // completionProvider: {
            // 	resolveProvider: true
            // }
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

documents.listen(connection);
connection.listen();
