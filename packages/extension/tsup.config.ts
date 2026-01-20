import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/extension.ts", "src/server.ts"],
    format: ["cjs"],
    external: ["vscode"],
    noExternal: [
        "@lmlang/core",
        "vscode-languageclient",
        "vscode-languageserver",
        "vscode-languageserver-textdocument",
    ],
    clean: true,
    sourcemap: true,
});
