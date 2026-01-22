import chalk from "chalk";

export const runCommand = {
    command: "$0 [path]",
    describe: "Run an lmlang project",
    builder: (yargs: any) =>
        yargs.positional("path", {
            describe: "Path to the project directory associated",
            type: "string",
        }),
    handler: async (argv: any) => {
        const fs = await import("node:fs/promises");
        const nodePath = await import("node:path");
        const yaml = await import("js-yaml");

        // Check if path is provided
        if (!argv.path) {
            console.log(
                chalk.yellow(
                    "No path provided. Use 'lmlang <path>' or 'lmlang init <name>'.",
                ),
            );
            return;
        }

        const projectDir = nodePath.resolve(argv.path as string);
        const configPath = nodePath.join(projectDir, "config.yml");

        let entrypointPath: string | undefined;

        try {
            // 1. Read Config
            const configContent = await fs.readFile(configPath, "utf-8");
            const config = yaml.load(configContent) as any;

            if (!config.entrypoint) {
                throw new Error("config.yml must specify 'entrypoint'");
            }

            // 2. Initialize Orchestrator
            // Import from @lmlang/core
            const { Orchestrator, Interpreter, Lexer, Parser, Scanner } =
                await import("@lmlang/core");

            // 2. Read Entrypoint (Early read for scanning)
            entrypointPath = nodePath.join(projectDir, config.entrypoint);
            const code = await fs.readFile(entrypointPath, "utf-8");

            // 3. Static Analysis (Scanner)
            const lexer = new Lexer(code);
            const tokens = lexer.tokenize();
            const parser = new Parser(tokens, code);
            const ast = parser.parse();

            const scanner = new Scanner(code);
            const scanResult = scanner.scan(ast);
            if (scanResult.errors.length > 0) {
                // Throw the first error to be caught below
                throw scanResult.errors[0];
            }

            // 3.1 Validate Containers (New step)
            // 3.1 Validate Containers (New step)
            const { findRuntimeLiterals, LmlangError } =
                await import("@lmlang/core");
            const runtimes = findRuntimeLiterals(ast);
            const validContainers = Object.keys(config.containers);

            for (const rt of runtimes) {
                if (!validContainers.includes(rt.runtimeName)) {
                    // Create a scan error format
                    if (rt.loc) {
                        throw new LmlangError(
                            `Container '${rt.runtimeName}' not found in configuration.`,
                            rt.loc,
                            code,
                            `Valid containers: ${validContainers.join(", ")}`,
                        );
                    } else {
                        throw new Error(
                            `Container '${rt.runtimeName}' not found in configuration.\n` +
                                `  Valid containers: ${validContainers.join(", ")}`,
                        );
                    }
                }
            }

            // 4. Initialize Orchestrator (Only if scan passes)
            const orchestrator = new Orchestrator(config, projectDir);
            await orchestrator.init();

            // 5. Interpret
            const interpreter = new Interpreter(orchestrator);
            await interpreter.run(ast, code);

            // Cleanup
            await orchestrator.destroy();

            console.log(chalk.green("\nExecution completed successfully."));
        } catch (e) {
            const fileLocation = entrypointPath ? ` in ${entrypointPath}` : "";
            console.error(
                chalk.red(`Error${fileLocation}: `),
                (e as Error).message,
                "\n",
            );
            process.exit(1);
        }
    },
};
