/**
 * This function is unifies the value to a string
 * @param val
 */
export function unify(val: unknown) {
    if (typeof val === "string") return `"${val}"`;
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "True" : "False";
    if (typeof val === "undefined") return "Undefined";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
}
