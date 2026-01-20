import * as path from "path";
import {
    workspace,
    ExtensionContext,
    window,
    commands,
    StatusBarAlignment,
} from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // 1. Output Channel
    const outputChannel = window.createOutputChannel("LMLang Language Server");
    outputChannel.appendLine("Activating LMLang Extension...");

    // 2. Status Bar Item
    const statusBarItem = window.createStatusBarItem(
        StatusBarAlignment.Right,
        100,
    );
    statusBarItem.text = "$(sync~spin) LMLang: Starting...";
    statusBarItem.tooltip = "LMLang Language Server is starting";
    statusBarItem.show();

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

    // Debugging info
    outputChannel.appendLine(`Server Module Path: ${serverModule}`);

    // Server options
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
    };

    // Client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "lmlang" }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
        },
        outputChannel: outputChannel,
    };

    // Create the client
    client = new LanguageClient(
        "lmlang",
        "LMLang Server",
        serverOptions,
        clientOptions,
    );

    // Start client
    client
        .start()
        .then(() => {
            outputChannel.appendLine("Language Client started successfully.");
            statusBarItem.text = "$(check) LMLang: Active";
            statusBarItem.tooltip = "LMLang Language Server is running";
            statusBarItem.command = "lmlang.restartServer";
        })
        .catch((err) => {
            outputChannel.appendLine(`Failed to start client: ${err}`);
            statusBarItem.text = "$(error) LMLang: Error";
            statusBarItem.tooltip = "Failed to start LMLang Server";
            window.showErrorMessage(
                "LMLang Server failed to start. Check output for details.",
            );
        });

    // Register Restart Command
    const restartCommand = commands.registerCommand(
        "lmlang.restartServer",
        async () => {
            outputChannel.appendLine("Restarting Language Server...");
            statusBarItem.text = "$(sync~spin) LMLang: Restarting...";

            if (client) {
                await client.stop();
            }

            // Re-create and start
            // Actually, just restart the client instance is handled by start() if stopped?
            // Best practice is to rely on client.restart() if available or dispose and recreate.
            // client.restart() is available in newer versions.
            try {
                await client.restart(); // Attempt restart
                outputChannel.appendLine("Restarted successfully.");
                statusBarItem.text = "$(check) LMLang: Active";
            } catch (e) {
                outputChannel.appendLine(`Restart failed: ${e}`);
                statusBarItem.text = "$(error) LMLang: Error";
            }
        },
    );

    context.subscriptions.push(restartCommand);
    context.subscriptions.push(statusBarItem);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
