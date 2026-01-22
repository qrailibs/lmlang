import * as path from "path";
import * as fs from "fs";
import { URI } from "vscode-uri";
import { AST, ASTNode, RuntimeLiteral } from "@lmlang/core";

// Helper to find config file in parent directories
export function findConfigFile(docUri: string): string | null {
    try {
        const parsedUri = URI.parse(docUri);
        if (parsedUri.scheme !== "file") return null;

        let currentDir = path.dirname(parsedUri.fsPath);
        const root = path.parse(currentDir).root;

        while (currentDir !== root) {
            const configPath = path.join(currentDir, "config.yml");
            if (fs.existsSync(configPath)) {
                return configPath;
            }
            // Also check for .yaml extension fallback
            const configPathYaml = path.join(currentDir, "config.yaml");
            if (fs.existsSync(configPathYaml)) {
                return configPathYaml;
            }

            const parent = path.dirname(currentDir);
            if (parent === currentDir) break;
            currentDir = parent;
        }
    } catch (e) {
        console.error(`Error finding config file: ${e}`);
    }
    return null;
}
