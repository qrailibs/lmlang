import { unify } from "./utils/unify";

export const io = {
    /**
     * Exit process
     * @param code exit code
     */
    exit: (code?: number) => process.exit(code),

    /**
     * Write message to stdout
     * @param message contents
     */
    write: Object.assign(
        (...messages: unknown[]) => {
            process.stdout.write(messages.map(unify).join("\n") + "\n");
        },
        {
            /**
             * Write raw message to stdout, without unification
             * @param message contents
             */
            raw: (...messages: unknown[]) => {
                process.stdout.write(messages.join("\n") + "\n");
            },
        },
    ),

    /**
     * Read message from stdin
     * @returns contents
     */
    read: async (): Promise<string> => {
        return new Promise((resolve) => {
            const readline = require("readline").createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            readline.question("", (answer: string) => {
                readline.close();
                resolve(answer);
            });
        });
    },
};
