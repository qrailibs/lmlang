import { unify } from "./utils/unify";
import { RuntimeValue } from "./types";
import { native } from "./utils/native";

export const io = {
    /**
     * Exit process
     * @param code exit code
     */
    exit: native(
        (code?: RuntimeValue) => {
            process.exit(code ? (code.value as number) : undefined);
        },
        {
            params: [{ name: "code?", type: "int" }],
            returnType: "nil",
        },
    ),

    /**
     * Write message to stdout
     * @param message contents
     */
    write: Object.assign(
        native(
            (...messages: RuntimeValue[]) => {
                process.stdout.write(messages.map(unify).join("\n") + "\n");
                return { type: "nil", value: undefined };
            },
            {
                params: [{ name: "...messages", type: "unknown" }],
                returnType: "nil",
            },
        ),
        {
            /**
             * Write raw message to stdout, without unification
             * @param message contents
             */
            raw: native(
                (...messages: RuntimeValue[]) => {
                    process.stdout.write(
                        messages.map((m) => String(m.value)).join("\n") + "\n",
                    );
                    return { type: "nil", value: undefined };
                },
                {
                    params: [{ name: "...messages", type: "unknown" }],
                    returnType: "nil",
                },
            ),
        },
    ),

    /**
     * Read message from stdin
     * @returns contents
     */
    read: native(
        async (): Promise<RuntimeValue> => {
            return new Promise((resolve) => {
                const readline = require("readline").createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
                readline.question("", (answer: string) => {
                    readline.close();
                    resolve({ type: "str", value: answer });
                });
            });
        },
        {
            params: [],
            returnType: "str",
        },
    ),
};
