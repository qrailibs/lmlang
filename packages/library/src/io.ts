import { unify } from "./utils/unify";

export const io = {
    /**
     * Write message to stdout
     * @param message contents
     */
    write: (...messages: unknown[]) => {
        process.stdout.write(messages.map(unify).join("\n") + "\n");
    },

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
