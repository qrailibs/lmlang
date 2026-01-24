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
        const fsSync = await import("node:fs");
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
            const moduleLoader = (path: string, base: string) => {
                try {
                    const dir = nodePath.dirname(base);
                    const resolved = nodePath.resolve(dir, path);
                    return fsSync.readFileSync(resolved, "utf-8");
                } catch (e) {
                    return null;
                }
            };

            const lexer = new Lexer(code);
            const tokens = lexer.tokenize();
            const parser = new Parser(tokens, code);
            const ast = parser.parse();

            const scanner = new Scanner(code, moduleLoader, entrypointPath);
            const scanResult = scanner.scan(ast);
            if (scanResult.errors.length > 0) {
                let errorLog = `Date: ${new Date().toISOString()}\n`;
                for (const error of scanResult.errors) {
                    console.error(error.message);
                    errorLog += error.message + "\n";
                }

                const summary = `\nFound ${scanResult.errors.length} errors.`;
                console.error(chalk.red(summary));
                errorLog += summary + "\n";

                const logDir = nodePath.join(projectDir, ".lml", "logs");
                await fs.mkdir(logDir, { recursive: true });
                const logPath = nodePath.join(logDir, "latest.txt");

                // Strip ANSI codes
                const cleanLog = errorLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
                await fs.writeFile(logPath, cleanLog, "utf-8");

                process.exit(1);
            }

            // 3.1 Validate Containers
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
            const interpreter = new Interpreter(
                orchestrator,
                moduleLoader,
                entrypointPath,
            );
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
