import chalk from "chalk";

import { IRuntimeContainer } from "./container/IRuntimeContainer";
import { BashContainer } from "./container/BashContainer";
import { NodejsContainer } from "./container/NodejsContainer";
import { PythonContainer } from "./container/PythonContainer";

export interface ProjectConfig {
    entrypoint: string;
    containers: Record<string, ContainerConfig>;
}

export interface ContainerConfig {
    runtime: "nodejs" | "python" | "bash";
    packageManager?: string;
    dependencies?: Record<string, string> | string[];
}

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
            } else if (containerConfig.runtime === "bash") {
                container = new BashContainer();
            } else {
                console.log(
                    chalk.red(
                        `[Orchestrator] Unknown runtime: ${containerConfig.runtime}. Available: nodejs, python.\n`,
                    ),
                );

                throw new Error("Unsupported runtime");
            }

            this.containers.set(name, container);
        }

        await Promise.allSettled(
            this.containers.entries().map(async ([name, container]) => {
                const startTime = Date.now();
                console.log(
                    chalk.yellow(`[${name}] Initializing container...`),
                );

                await container.init();

                const endTime = Date.now();
                const tookSec = ((endTime - startTime) / 1000).toFixed(1);
                console.log(
                    chalk.green(
                        `[${name}] Container is ready, took ${tookSec}s`,
                    ),
                );
            }),
        );

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
