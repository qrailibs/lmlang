import chalk from "chalk";

/**
 * Creates a formatted error message pointing to a specific location in the source code.
 *
 * @param source The full source code string
 * @param loc The location object containing line and col (1-indexed)
 * @param message The error message
 * @param hint Optional hint to display below the error
 */
export function makeError(
    source: string,
    loc: { line: number; col: number },
    message: string,
    hint?: string,
): Error {
    if (!source) {
        return new Error(
            `${message}\n(Source code not available for detailed error reporting)`,
        );
    }

    const lines = source.split("\n");
    // loc.line is 1-indexed
    const lineIndex = loc.line - 1;
    const lineContent = lines[lineIndex];

    const lineNumStr = String(loc.line);
    const padding = " ".repeat(lineNumStr.length);

    // Format:
    // Error: [Message]
    //    --> line [line]:[col]
    //     |
    // 10  | str x = 10
    //     |     ^
    //     |
    //     = [Hint]

    const errorHeader = `${chalk.red.bold("Error:")} ${chalk.bold(message)}`;
    const locationLine = `${chalk.blue(padding)} ${chalk.blue("-->")} line ${loc.line}:${loc.col}`;
    const pipeLine = `${chalk.blue(padding)} ${chalk.blue("|")}`;
    const codeLine = `${chalk.blue(lineNumStr)} ${chalk.blue("|")} ${lineContent}`;

    // Create pointer line
    // loc.col is 1-indexed, so we need col-1 spaces
    const pointerSpace = " ".repeat(Math.max(0, loc.col - 1));
    const pointerLine = `${chalk.blue(padding)} ${chalk.blue("|")} ${pointerSpace}${chalk.red.bold("^")}`;

    let output = [
        errorHeader,
        locationLine,
        pipeLine,
        codeLine,
        pointerLine,
        pipeLine,
    ];

    if (hint) {
        const hintLine = `${chalk.blue(padding)} ${chalk.blue("=")} ${hint}`;
        output.push(hintLine);
    }

    return new Error("\n" + output.join("\n"));
}
