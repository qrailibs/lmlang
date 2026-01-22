import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { spawn, ChildProcess } from "child_process";

import { ContainerConfig } from "../Orchestrator";
import { IRuntimeContainer } from "./IRuntimeContainer";

const REPL_SCRIPT = `
import sys
import json
import traceback

print("__LML_READY__")
sys.stdout.flush()

def safe_json(obj, seen=None):
    if seen is None:
        seen = set()

    obj_id = id(obj)
    if obj_id in seen:
        return "<circular>"
    seen.add(obj_id)

    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj

    if isinstance(obj, dict):
        return {str(k): make_json_safe(v, seen) for k, v in obj.items()}

    if isinstance(obj, (list, tuple, set)):
        return [make_json_safe(v, seen) for v in obj]

    if hasattr(obj, "__dict__"):
        return make_json_safe(vars(obj), seen)

    return str(obj)

def run_repl():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        
        try:
            payload = json.loads(line)
            code = payload['code']
            context = payload['context']
            
            # Prepare execution environment
            # We use globals so the wrapper function can access context variables
            exec_globals = globals().copy()
            exec_globals.update(context)
            
            # Wrap code in function to allow 'return'
            indented_code = ""
            for x in code.split('\\n'):
                indented_code += "    " + x + "\\n"
            
            wrapper = "def __lml_wrapper():\\n" + indented_code
            
            # Execute wrapper definition
            exec(wrapper, exec_globals)
            
            # Call wrapper and get result
            result = exec_globals['__lml_wrapper']()
            
            print("__LML_RESULT__" + json.dumps(safe_json(result)))
            sys.stdout.flush()
            
        except Exception:
            # Print error
            err = traceback.format_exc()
            # print error to stderr so parent sees it
            sys.stderr.write(err)
            sys.stderr.flush()
            print("__LML_ERROR__" + str(err).replace("\\n", " "))
            sys.stdout.flush()

if __name__ == "__main__":
    run_repl()
`;

/**
 * Implements runtime container for Python 3
 */
export class PythonContainer implements IRuntimeContainer {
    private static readonly PYTHON_CLI = "python3";
    private static readonly PIP_CLI = "pip3";

    private process?: ChildProcess;
    private cwd: string;
    private resolveExecution?: (value: any) => void;
    private rejectExecution?: (reason?: any) => void;

    constructor(
        private name: string,
        private projectDir: string,
        private config: ContainerConfig,
    ) {
        this.cwd = path.join(projectDir, ".lml", "python");
    }

    async init(): Promise<void> {
        await fs.mkdir(this.cwd, { recursive: true });

        // 1. Install Dependencies
        await this.installDependencies();

        // 2. Create REPL Script
        const entrypoint = path.join(this.cwd, "main.py");
        await fs.writeFile(entrypoint, REPL_SCRIPT);

        // 3. Spawn

        // Use python3, set PYTHONPATH to include current dir so installed deps work
        const env = {
            ...process.env,
            PYTHONPATH:
                this.cwd +
                (process.env.PYTHONPATH
                    ? path.delimiter + process.env.PYTHONPATH
                    : ""),
        };

        // We need to execute the repl script which is in workDir
        this.process = spawn(PythonContainer.PYTHON_CLI, [entrypoint], {
            cwd: this.projectDir,
            env,
        });
        this.process.stdout?.setEncoding("utf-8");
        this.process.stderr?.pipe(process.stderr);

        // Wait for Ready
        await new Promise<void>((resolve, reject) => {
            const onData = (data: Buffer | string) => {
                if (data.toString().includes("__LML_READY__")) {
                    this.process?.stdout?.off("data", onData);
                    resolve();
                }
            };
            this.process?.stdout?.on("data", onData);
        });

        // Setup Listener (Same pattern as Node)
        this.process.stdout?.on("data", (data) => {
            const str = data.toString();
            if (str.includes("__LML_RESULT__")) {
                const part = str.split("__LML_RESULT__")[1].trim();
                try {
                    const res = JSON.parse(part);
                    if (this.resolveExecution) {
                        this.resolveExecution(res);
                        this.resolveExecution = undefined;
                    }
                } catch (e) {}
            } else if (str.includes("__LML_ERROR__")) {
                const err = str.split("__LML_ERROR__")[1].trim();
                if (this.rejectExecution) {
                    this.rejectExecution(new Error(err));
                    this.rejectExecution = undefined;
                }
            } else {
                console.log(chalk.dim(str.trim()));
            }
        });
    }

    async installDependencies() {
        if (!this.config.dependencies) return;

        console.log(chalk.yellow(`[${this.name}] Installing dependencies...`));

        // Packages might be specified in two formats:
        // 1. { "matplotlib": "latest" }
        // 2. [ "matplotlib" ]
        const packages = Array.isArray(this.config.dependencies)
            ? this.config.dependencies
            : Object.keys(this.config.dependencies);

        if (packages.length > 0) {
            const pipArgs = ["install", ...packages];
            pipArgs.push("--target", ".");
            pipArgs.push("--quiet");

            return new Promise<void>((resolve, reject) => {
                const child = spawn(PythonContainer.PIP_CLI, pipArgs, {
                    cwd: this.cwd,
                    stdio: "inherit",
                });
                child.on("close", (code) => {
                    if (code === 0) resolve();
                    else
                        reject(
                            new Error(`Pip install failed with code ${code}`),
                        );
                });
            });
        }
    }

    async execute(code: string, context: Record<string, any>): Promise<any> {
        if (!this.process) throw new Error("Runtime not started");

        // Dedent is handled in previous implementation but here we pass raw string.
        // We should dedupe indentation here before sending JSON.
        const dedent = (str: string) => {
            const lines = str.split("\n");
            let minIndent = Infinity;
            for (const line of lines) {
                if (line.trim().length === 0) continue;
                const indent = line.match(/^\s*/)?.[0].length || 0;
                if (indent < minIndent) minIndent = indent;
            }
            if (minIndent === Infinity) return str;
            return lines
                .map((line) =>
                    line.length >= minIndent ? line.substring(minIndent) : line,
                )
                .join("\n");
        };

        const dedented = dedent(code);

        return new Promise((resolve, reject) => {
            this.resolveExecution = resolve;
            this.rejectExecution = reject;
            const payload = JSON.stringify({ code: dedented, context });
            this.process?.stdin?.write(payload + "\n");
        });
    }

    async destroy(): Promise<void> {
        if (this.process) this.process.kill();
    }
}
