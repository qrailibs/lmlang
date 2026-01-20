import { ProjectConfig } from "./Config";
import { IRuntimeContainer } from "./container/IRuntimeContainer";
import { NodejsContainer } from "./container/NodejsContainer";
import { PythonContainer } from "./container/PythonContainer";
import chalk from "chalk";

export class Orchestrator {
    private containers: Map<string, IRuntimeContainer> = new Map();

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

        for (const [name, containerConfig] of Object.entries(
            this.config.containers,
        )) {
            let container: IRuntimeContainer;
            if (containerConfig.runtime === "nodejs") {
                container = new NodejsContainer(
                    name,
                    this.projectDir,
                    containerConfig,
                );
            } else if (containerConfig.runtime === "python") {
                container = new PythonContainer(
                    name,
                    this.projectDir,
                    containerConfig,
                );
            } else {
                console.log(
                    chalk.red(
                        `[Orchestrator] Unknown runtime: ${containerConfig.runtime}. Available: nodejs, python.\n`,
                    ),
                );

                throw new Error("Unsupported runtime");
            }

            const startTime = Date.now();
            console.log(chalk.yellow(`[${name}] Initializing container...`));

            await container.init();
            this.containers.set(name, container);

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
        containerName: string,
        code: string,
        context: Record<string, any>,
    ): Promise<any> {
        const container = this.containers.get(containerName);

        if (!container) {
            console.log(
                chalk.red(
                    `[Orchestrator] Container '${containerName}' not found or not initialized in config.\n`,
                ),
            );

            throw new Error("Container not found.");
        }

        return container.execute(code, context);
    }

    public async destroy(): Promise<void> {
        for (const container of this.containers.values()) {
            await container.destroy();
        }

        console.log();
        console.log(
            chalk.bold.magenta("[Orchestrator] All containers is destroyed.\n"),
        );
    }
}
