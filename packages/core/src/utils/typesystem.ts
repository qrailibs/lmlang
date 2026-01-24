import { VariableType } from "@lmlang/library";

export function typeToString(type: VariableType): string {
    if (typeof type === "string") return type;

    if (typeof type === "object") {
        if (type.base === "array") {
            return `array[${typeToString(type.generic)}]`;
        }
        if (type.base === "struct") {
            const fields = type.fields
                ? Object.entries(type.fields)
                      .map(([k, v]) => `${k}: ${typeToString(v)}`)
                      .join(", ")
                : "";
            return `{ ${fields} }`;
        }
    }

    return "unknown";
}

export function typesMatch(t1: VariableType, t2: VariableType): boolean {
    if (t1 === t2) return true;
    if (t1 === "unknown" || t2 === "unknown") return true;

    // obj matches any struct
    if (t1 === "obj" && typeof t2 === "object" && t2.base === "struct")
        return true;
    if (t2 === "obj" && typeof t1 === "object" && t1.base === "struct")
        return true;

    if (typeof t1 === "object" && typeof t2 === "object") {
        if (t1.base !== t2.base) return false;
        if (t1.base === "array") {
            return typesMatch(t1.generic, (t2 as any).generic);
        }
        if (t1.base === "struct") {
            // Structural equality? Or subset?
            // For now, allow compatibility if fields match
            // A precise implementation would check all fields in t1 exist in t2 and match.
            // But let's assume they must be identical or one is unknown.
            // Simplified: return true if both are structs (since we allowed obj mixing).

            // Check fields match
            const f1 = t1.fields || {};
            const f2 = (t2 as any).fields || {};
            const keys1 = Object.keys(f1);
            const keys2 = Object.keys(f2);
            if (keys1.length !== keys2.length) return false;
            for (const k of keys1) {
                if (!f2[k]) return false;
                if (!typesMatch(f1[k], f2[k])) return false;
            }
            return true;
        }
    }
    return false;
}

export function validateTypeConversion(
    sourceType: VariableType,
    targetType: VariableType,
): void {
    if (sourceType === "unknown" || targetType === "unknown") return;
    if (typesMatch(sourceType, targetType)) return;

    // Strict structural checks for conversions
    // 1. Target is Array
    if (typeof targetType === "object" && targetType.base === "array") {
        if (typeof sourceType !== "object" || sourceType.base !== "array") {
            throw new Error(
                `Cannot convert non-array to ${typeToString(targetType)}`,
            );
        }
    }

    // 2. Target is Struct/Obj
    if (typeof targetType === "object" && targetType.base === "struct") {
        // Only allow other structs or 'obj' (which is just "obj" string, checked by typesMatch above?)
        // typesMatch handled "obj" <-> "struct".
        // If we are here, typesMatch returned false.
        // So sourceType might be int/str/array etc.
        if (
            sourceType !== "obj" &&
            (typeof sourceType !== "object" || sourceType.base !== "struct")
        ) {
            // We usually don't convert primitive to struct via cast, but maybe?
            // For now, let's just restrict non-struct -> struct if needed.
            // But let's focus on the reported issue: Array conversion.
        }
    }
}
