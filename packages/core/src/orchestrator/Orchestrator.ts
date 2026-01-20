import { ProjectConfig } from "./Config";
import { Runtime } from "./runtime/Runtime";
import { NodeRuntime } from "./runtime/NodeRuntime";
import { PythonRuntime } from "./runtime/PythonRuntime";
import chalk from "chalk";

export class Orchestrator {
    private runtimes: Map<string, Runtime> = new Map();

    constructor(
        private config: ProjectConfig,
        private projectDir: string,
    ) {}

    public async init(): Promise<void> {
        console.log(
            chalk.bold.magenta(
                "\n[Orchestrator] Spinning up all containers...",
            ),
        );

        for (const [name, container] of Object.entries(
            this.config.containers,
        )) {
            let runtime: Runtime;
            if (container.runtime === "nodejs") {
                runtime = new NodeRuntime(name, this.projectDir, container);
            } else if (container.runtime === "python") {
                runtime = new PythonRuntime(name, this.projectDir, container);
            } else {
                console.log(
                    chalk.red(
                        `[Orchestrator] Unknown runtime: ${container.runtime}. Available: nodejs, python.\n`,
                    ),
                );

                throw new Error("Unsupported runtime");
            }

            const startTime = Date.now();
            console.log(chalk.yellow(`[${name}] Initializing container...`));

            await runtime.init();
            this.runtimes.set(name, runtime);

            const endTime = Date.now();
            console.log(
                chalk.green(
                    `[${name}] Container is ready, took ${endTime - startTime}ms.`,
                ),
            );
        }

        console.log(
            chalk.bold.magenta("[Orchestrator] All containers is ready.\n"),
        );
    }

    public async execute(
        runtimeName: string,
        code: string,
        context: Record<string, any>,
    ): Promise<any> {
        const runtime = this.runtimes.get(runtimeName);
        if (!runtime) {
            console.log(
                chalk.red(
                    `[Orchestrator] Runtime '${runtimeName}' not found or not initialized in config.\n`,
                ),
            );

            throw new Error("Runtime not found");
        }
        return runtime.execute(code, context);
    }

    public async destroy(): Promise<void> {
        for (const runtime of this.runtimes.values()) {
            await runtime.destroy();
        }

        console.log();
        console.log(
            chalk.bold.magenta("[Orchestrator] All containers is destroyed.\n"),
        );
    }
}
