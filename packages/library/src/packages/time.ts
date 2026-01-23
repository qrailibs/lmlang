import { RuntimeValue } from "../types";
import { native } from "../utils/native";

export const time = {
    /**
     * Get current timestamp in milliseconds
     * @returns timestamp
     */
    now: native(
        (): RuntimeValue => {
            return {
                type: "int",
                value: Date.now(),
            };
        },
        {
            params: [],
            returnType: "int",
            description: "Get current timestamp in milliseconds",
        },
    ),

    /**
     * Sleep for a specified number of milliseconds (synchronous)
     * @param ms milliseconds to sleep
     */
    sleep: native(
        (ms: RuntimeValue): RuntimeValue => {
            const millis = ms.value as number;
            const end = Date.now() + millis;
            while (Date.now() < end) {
                // busy wait
            }
            return {
                type: "nil",
                value: undefined,
            };
        },
        {
            params: [
                {
                    name: "ms",
                    type: "int",
                    description: "milliseconds to sleep",
                },
            ],
            returnType: "nil",
            description:
                "Sleep for a specified number of milliseconds (synchronous)",
        },
    ),

    /**
     * Format a timestamp into a string
     * @param timestamp timestamp in milliseconds
     * @param formatStr format string (e.g. "YYYY-MM-DD HH:mm:ss")
     * @returns formatted date string
     */
    format: native(
        (timestamp: RuntimeValue, formatStr: RuntimeValue): RuntimeValue => {
            const ts = timestamp.value as number;
            const fmt = formatStr.value as string;
            const date = new Date(ts);

            const pad = (n: number) => n.toString().padStart(2, "0");

            const replacements: Record<string, string> = {
                YYYY: date.getFullYear().toString(),
                MM: pad(date.getMonth() + 1),
                DD: pad(date.getDate()),
                HH: pad(date.getHours()),
                mm: pad(date.getMinutes()),
                ss: pad(date.getSeconds()),
                SSS: date.getMilliseconds().toString().padStart(3, "0"),
            };

            let result = fmt;
            for (const key in replacements) {
                result = result.replace(
                    new RegExp(key, "g"),
                    replacements[key],
                );
            }

            return {
                type: "str",
                value: result,
            };
        },
        {
            params: [
                {
                    name: "timestamp",
                    type: "int",
                    description: "timestamp in milliseconds",
                },
                {
                    name: "formatStr",
                    type: "str",
                    description: 'format string (e.g. "YYYY-MM-DD HH:mm:ss")',
                },
            ],
            returnType: "str",
            description: "Format a timestamp into a string",
        },
    ),

    /**
     * Parse a date string into a timestamp
     * @param dateStr date string
     * @returns timestamp in milliseconds
     */
    parse: native(
        (dateStr: RuntimeValue): RuntimeValue => {
            const str = dateStr.value as string;
            const ts = Date.parse(str);
            if (isNaN(ts)) {
                return {
                    type: "int",
                    value: -1, // Or handle error appropriately? For now, -1 or 0
                };
            }
            return {
                type: "int",
                value: ts,
            };
        },
        {
            params: [
                { name: "dateStr", type: "str", description: "date string" },
            ],
            returnType: "int",
            description: "Parse a date string into a timestamp",
        },
    ),

    /**
     * Measure time elapsed since a timestamp
     * @param timestamp start timestamp
     * @returns milliseconds elapsed
     */
    since: native(
        (timestamp: RuntimeValue): RuntimeValue => {
            const start = timestamp.value as number;
            const now = Date.now();
            return {
                type: "int",
                value: now - start,
            };
        },
        {
            params: [
                {
                    name: "timestamp",
                    type: "int",
                    description: "start timestamp",
                },
            ],
            returnType: "int",
            description:
                "Measure time elapsed since a timestamp (returns milliseconds)",
        },
    ),

    /**
     * Get ISO string from timestamp
     * @param timestamp timestamp
     * @returns ISO string
     */
    iso: native(
        (timestamp: RuntimeValue): RuntimeValue => {
            const ts = timestamp.value as number;
            return {
                type: "str",
                value: new Date(ts).toISOString(),
            };
        },
        {
            params: [
                { name: "timestamp", type: "int", description: "timestamp" },
            ],
            returnType: "str",
            description: "Get ISO string from timestamp",
        },
    ),
};
