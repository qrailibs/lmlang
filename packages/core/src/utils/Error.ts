import chalk from "chalk";

export interface ErrorLocation {
    line: number;
    col: number;
    len?: number;
    endLine?: number;
    endCol?: number;
}

export class LmlangError extends Error {
    public rawMessage: string;
    public loc: ErrorLocation;
    public source?: string;
    public hint?: string;

    constructor(
        message: string,
        loc: ErrorLocation,
        source?: string,
        hint?: string,
    ) {
        // Construct formatted message
        const lines = source ? source.split("\n") : [];
        const lineIndex = loc.line - 1;
        const lineContent = lines[lineIndex] || "";

        const lineNumStr = String(loc.line);
        const padding = " ".repeat(lineNumStr.length);

        const errorHeader = `${chalk.red.bold("Error:")} ${chalk.bold(message)}`;
        const locationLine = `${chalk.blue(padding)} ${chalk.blue("-->")} line ${loc.line}:${loc.col}`;
        const pipeLine = `${chalk.blue(padding)} ${chalk.blue("|")}`;
        const codeLine = `${chalk.blue(lineNumStr)} ${chalk.blue("|")} ${lineContent}`;

        const pointerSpace = " ".repeat(Math.max(0, loc.col - 1));
        const underlineLen = Math.max(1, loc.len || 1);
        const pointer = chalk.red.bold("^".repeat(underlineLen));
        const pointerLine = `${chalk.blue(padding)} ${chalk.blue("|")} ${pointerSpace}${pointer}`;

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

        const formatted = "\n" + output.join("\n");

        super(formatted);
        this.name = "LmlangError";
        this.rawMessage = message;
        this.loc = loc;
        this.source = source;
        this.hint = hint;
    }
}

export function makeError(
    source: string,
    loc: ErrorLocation,
    message: string,
    hint?: string,
): LmlangError {
    return new LmlangError(message, loc, source, hint);
}
