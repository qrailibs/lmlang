"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsup_1 = require("tsup");
exports.default = (0, tsup_1.defineConfig)({
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
//# sourceMappingURL=tsup.config.js.map