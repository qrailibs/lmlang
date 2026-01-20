import { Runtime } from "./Runtime";
import { ContainerConfig } from "../Config";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

export class NodeRuntime implements Runtime {
    private process?: ChildProcess;
    private buffer = "";
    private resolveExecution?: (value: any) => void;
    private rejectExecution?: (reason?: any) => void;
    private workDir: string;

    constructor(
        private name: string,
        private projectDir: string,
        private config: ContainerConfig,
    ) {
        this.workDir = path.join(projectDir, ".lml", "nodejs");
    }

    async init(): Promise<void> {
        // 1. Prepare Workspace
        await fs.mkdir(this.workDir, { recursive: true });

        // 2. Generate package.json
        const packageJson = {
            name: "lmlang-nodejs-runtime",
            private: true,
            dependencies: this.config.dependencies || {},
            type: "commonjs", // Ensure we can use require easily
        };
        await fs.writeFile(
            path.join(this.workDir, "package.json"),
            JSON.stringify(packageJson, null, 2),
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
                cwd: this.workDir,
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
        const replScript = `
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
        await fs.writeFile(path.join(this.workDir, "repl.js"), replScript);

        // 5. Spawn Persistent Process
        console.log(chalk.yellow(`[${this.name}] Spawning runtime process...`));

        const replPath = path.join(this.workDir, "repl.js");
        this.process = spawn("node", [replPath], { cwd: this.projectDir });

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
        if (!this.process) throw new Error("Runtime not started");

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
