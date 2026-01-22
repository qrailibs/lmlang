import { spawn, spawnSync } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
import { IRuntimeContainer } from "./IRuntimeContainer";

/**
 * Implements runtime container for Bash
 */
export class BashContainer implements IRuntimeContainer {
    private shellCmd: string = "/bin/bash";
    private shellArgs: string[] = [];

    constructor() {}

    // Detects available bash interpreter on the current platform
    async init(): Promise<void> {
        const plat = platform();

        if (plat === "linux" || plat === "darwin") {
            return;
        }

        if (plat === "win32") {
            const gitBashPaths = [
                "C:\\Program Files\\Git\\bin\\bash.exe",
                "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                process.env.PROGRAMFILES + "\\Git\\bin\\bash.exe",
            ].filter(Boolean);

            for (const path of gitBashPaths) {
                if (path && existsSync(path)) {
                    this.shellCmd = path;
                    this.shellArgs = [];
                    return;
                }
            }

            try {
                spawnSync("wsl", ["--status"], { stdio: "ignore" });
                this.shellCmd = "wsl";
                this.shellArgs = ["bash"];
                return;
            } catch {
                // WSL not available
            }

            throw new Error(
                "No bash interpreter found. Please install Git for Windows or WSL.",
            );
        }

        throw new Error(`Unsupported platform: ${plat}`);
    }

    async execute(
        code: string,
        context: Record<string, any>,
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const env = this.createEnv(context);

            const proc = spawn(this.shellCmd, [...this.shellArgs, "-c", code], {
                env,
            });

            let stdout = "";
            let stderr = "";

            proc.stdout.on("data", (data) => {
                stdout += data.toString();
            });

            proc.stderr.on("data", (data) => {
                stderr += data.toString();
            });

            proc.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(
                        new Error(
                            stderr.trim() || `Command failed with code ${code}`,
                        ),
                    );
                }
            });

            proc.on("error", (err) => {
                reject(err);
            });
        });
    }

    executeSync(code: string, context: Record<string, any>): unknown {
        const env = this.createEnv(context);

        const result = spawnSync(
            this.shellCmd,
            [...this.shellArgs, "-c", code],
            {
                env,
                encoding: "utf-8",
            },
        );

        if (result.error) {
            throw result.error;
        }

        if (result.status !== 0) {
            throw new Error(
                result.stderr?.trim() ||
                    `Command failed with code ${result.status}`,
            );
        }

        return result.stdout.trim();
    }

    async destroy(): Promise<void> {
        // nothing to destroy
    }

    private createEnv(context: Record<string, any>): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...process.env };
        for (const [key, value] of Object.entries(context)) {
            if (typeof value === "object") {
                env[key] = JSON.stringify(value);
            } else {
                env[key] = String(value);
            }
        }
        return env;
    }
}
