import chalk from "chalk";

const DEFAULT_CONFIG = `entrypoint: "app.lml"
containers:
    py:
        runtime: "python"
        dependencies:
            # Add python dependencies here
`;

const DEFAULT_APP = `import {write} from "lmlang/io";

// Run code inside "py" python container, get result
str msg = <py>
    return "Hello from Python!"
</py>

// Write result to console
write(msg);
`;

export const initCommand = {
    command: "init <name>",
    describe: "Initialize a new lmlang project",
    builder: (yargs: any) => {
        return yargs.positional("name", {
            describe: "Name of the new project directory",
            type: "string",
        });
    },
    handler: async (argv: any) => {
        const fs = await import("node:fs/promises");
        const nodePath = await import("node:path");

        const name = argv.name as string;
        const projectDir = nodePath.resolve(name);

        try {
            // 1. Create Directory
            await fs.mkdir(projectDir, { recursive: true });
            console.log(chalk.green(`Created directory ${name}/`));

            // 2. Create .gitignore
            await fs.writeFile(
                nodePath.join(projectDir, ".gitignore"),
                ".lml\n",
            );
            console.log(chalk.gray(`Created ${name}/.gitignore`));

            // 3. Create config.yaml
            await fs.writeFile(
                nodePath.join(projectDir, "config.yaml"),
                DEFAULT_CONFIG,
            );
            console.log(chalk.gray(`Created ${name}/config.yaml`));

            // 4. Create app.lml
            await fs.writeFile(
                nodePath.join(projectDir, "app.lml"),
                DEFAULT_APP,
            );
            console.log(chalk.gray(`Created ${name}/app.lml`));

            console.log(
                chalk.green(`\nProject '${name}' initialized successfully!`),
            );
            console.log(chalk.white(`Run with: lmlang ${name}`));
        } catch (e: any) {
            console.error(
                chalk.red(`Failed to initialize project: ${e.message}`),
            );
            process.exit(1);
        }
    },
};
