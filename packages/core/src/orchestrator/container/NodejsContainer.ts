import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { spawn, ChildProcess } from "child_process";

import { ContainerConfig } from "../Orchestrator";
import { IRuntimeContainer } from "./IRuntimeContainer";

const REPL_SCRIPT = /*js*/ `
const { resolve } = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

global.require = require; // Expose require to function scope
console.log("__LML_READY__"); // Signal ready

rl.on('line', async (line) => {
    try {
        if (!line.trim()) return;
        const payload = JSON.parse(line);
        // payload: { code: string, context: object }
        
        // Inject context globals
        const contextKeys = Object.keys(payload.context);
        const contextValues = Object.values(payload.context);
        
        // Wrap code
        // We evaluate code using Function constructor with arguments for context
        // OR better: use eval in a scope where context vars are defined.
        // For simple usage, Function is cleaner but context vars need to be arguments.
        // But user code is top-level statements. "const fs = require..."
        // If we use Function, variables declared are local to function.
        // That's fine.
        
        const func = new Function(...contextKeys, \`
            return (async () => { 
                \${payload.code} 
            })();
        \`);
        
        const result = await func(...contextValues);
        
        console.log("__LML_RESULT__" + JSON.stringify(result));
    } catch (e) {
        console.log("__LML_ERROR__" + e.toString()); // Simple error string
        // Log stack to stderr for debug
        console.error(e); 
    }
});
`;

/**
 * Implements runtime container for Node.js
 */
export class NodejsContainer implements IRuntimeContainer {
    /**
     * Directory where dependencies will be installed
     */
    private cwd: string;

    private process?: ChildProcess;
    private buffer = "";
    private resolveExecution?: (value: any) => void;
    private rejectExecution?: (reason?: any) => void;

    constructor(
        private name: string,
        private projectDir: string,
        private config: ContainerConfig,
    ) {
        this.cwd = path.join(projectDir, ".lml", "nodejs");
    }

    async init(): Promise<void> {
        // 1. Prepare Workspace
        await fs.mkdir(this.cwd, { recursive: true });

        // 2. Generate package.json
        await fs.writeFile(
            path.join(this.cwd, "package.json"),
            JSON.stringify(
                {
                    name: "lmlang-runtime-container",
                    private: true,
                    dependencies: this.config.dependencies || {},
                    type: "commonjs",
                },
                null,
                2,
            ),
        );

        // 3. Install Dependencies
        // TODO: handle only npm, pnpm, yarn, bun. If not of these values -> throw error
        const pkgManager = this.config.packageManager || "npm";
        console.log(
            chalk.yellow(
                `[${this.name}] Installing dependencies with ${pkgManager}...`,
            ),
        );

        await new Promise<void>((resolve, reject) => {
            const installParam =
                pkgManager === "npm" ? ["install", "--silent"] : ["install"]; // pnpm usually silent by default or less noisy
            const child = spawn(pkgManager, installParam, {
                cwd: this.cwd,
                stdio: "inherit",
            });
            child.on("close", (code) => {
                if (code === 0) resolve();
                else
                    reject(
                        new Error(
                            `Dependency installation failed with code ${code}`,
                        ),
                    );
            });
        });

        // 4. Create REPL Script
        const entrypoint = path.join(this.cwd, "index.js");
        await fs.writeFile(entrypoint, REPL_SCRIPT);

        // 5. Spawn Persistent Process
        this.process = spawn("node", [entrypoint], { cwd: this.cwd });

        this.process.stdout?.setEncoding("utf-8");
        this.process.stderr?.pipe(process.stderr); // Pass stderr through

        // Wait for Ready Signal
        await new Promise<void>((resolve, reject) => {
            const onData = (data: Buffer | string) => {
                if (data.toString().includes("__LML_READY__")) {
                    this.process?.stdout?.off("data", onData);
                    resolve();
                }
            };
            this.process?.stdout?.on("data", onData);
        });

        // Setup persistent data listener
        this.process.stdout?.on("data", (data) => {
            this.buffer += data.toString();

            // Process complete lines
            let newlineIndex;
            while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
                const line = this.buffer.slice(0, newlineIndex).trim();
                this.buffer = this.buffer.slice(newlineIndex + 1);

                if (!line) continue;

                if (line.includes("__LML_RESULT__")) {
                    const resJson = line.split("__LML_RESULT__")[1].trim();
                    try {
                        const result = JSON.parse(resJson);
                        if (this.resolveExecution) {
                            this.resolveExecution(result);
                            this.resolveExecution = undefined;
                        }
                    } catch (e) {
                        // ignore parse error if split bad
                    }
                } else if (line.includes("__LML_ERROR__")) {
                    const err = line.split("__LML_ERROR__")[1].trim();
                    if (this.rejectExecution) {
                        this.rejectExecution(new Error(err));
                        this.rejectExecution = undefined;
                    }
                } else {
                    console.log(chalk.dim("[Node] " + line)); // Logs
                }
            }
        });
    }

    async execute(code: string, context: Record<string, any>): Promise<any> {
        if (!this.process) throw new Error("Runtime not started yet.");

        return new Promise((resolve, reject) => {
            this.resolveExecution = resolve;
            this.rejectExecution = reject;

            const payload = JSON.stringify({ code, context });
            // Send single line JSON
            this.process?.stdin?.write(payload + "\n");
        });
    }

    async destroy(): Promise<void> {
        if (this.process) {
            this.process.kill();
        }
    }
}
