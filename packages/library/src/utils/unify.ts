import { RuntimeValue } from "../types";

/**
 * This function unifies the value to a string
 * @param val
 */
export function unify(val: RuntimeValue): string {
    const value = val.value;

    if (val.type === "str") return `"${value}"`;
    if (val.type === "int") return String(value);
    if (val.type === "dbl") return String(value);
    if (val.type === "bool") return value ? "True" : "False";
    if (val.type === "nil") return "Nil";
    if (val.type === "obj") return JSON.stringify(value);

    // Fallback for unknown/other types
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (value === undefined || value === null) return "Nil";
    if (typeof value === "object") return JSON.stringify(value);

    return String(value);
}
