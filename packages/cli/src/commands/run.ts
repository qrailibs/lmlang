import chalk from "chalk";

export const runCommand = {
    command: "$0 [path]",
    describe: "Run an lmlang project",
    builder: (yargs: any) => {
        return yargs.positional("path", {
            describe: "Path to the project directory associated",
            type: "string",
            // Remove default "." so we can detect if argument is missing
        });
    },
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
        const configPath = nodePath.join(projectDir, "config.yaml");

        try {
            // 1. Read Config
            const configContent = await fs.readFile(configPath, "utf-8");
            const config = yaml.load(configContent) as any;

            if (!config.entrypoint) {
                throw new Error("config.yaml must specify 'entrypoint'");
            }

            // 2. Initialize Orchestrator
            // Import from @lmlang/core
            const { Orchestrator, Interpreter, Lexer, Parser } =
                await import("@lmlang/core");

            const orchestrator = new Orchestrator(config, projectDir);
            await orchestrator.init();

            // 3. Read Entrypoint
            const entrypointPath = nodePath.join(projectDir, config.entrypoint);
            const code = await fs.readFile(entrypointPath, "utf-8");

            // 4. Interpret
            const lexer = new Lexer(code);
            const tokens = lexer.tokenize();
            const parser = new Parser(tokens);
            const ast = parser.parse();
            const interpreter = new Interpreter(orchestrator);

            await interpreter.run(ast);

            // Cleanup
            await orchestrator.destroy();

            console.log(chalk.green("\nExecution completed successfully."));
        } catch (e: any) {
            console.error(chalk.red(`Error: ${e.message}`));
            if (e.code === "ENOENT") {
                console.error(
                    chalk.gray(`Could not find config.yaml at ${configPath}`),
                );
            }
            process.exit(1);
        }
    },
};
