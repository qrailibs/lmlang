import path from "path";
import nativeFs from "fs";
import { RuntimeValue } from "../types";
import { native } from "../utils/native";

export const fs = {
    /**
     * Convert relative to absolute path
     * @param relativePath relative path
     * @returns absolute path
     */
    path: native(
        (relativePath: RuntimeValue): RuntimeValue => {
            const val = relativePath.value as string;
            return {
                type: "str",
                value: path.resolve(val),
            };
        },
        {
            params: [{ name: "relativePath", type: "str" }],
            returnType: "str",
        },
    ),

    readFile: native(
        (filePath: RuntimeValue): RuntimeValue => {
            const val = filePath.value as string;
            return {
                type: "str",
                value: nativeFs.readFileSync(val, "utf-8"),
            };
        },
        {
            params: [{ name: "filePath", type: "str" }],
            returnType: "str",
        },
    ),

    writeFile: native(
        (filePath: RuntimeValue, data: RuntimeValue): RuntimeValue => {
            const p = filePath.value as string;
            const d = data.value as string;
            nativeFs.writeFileSync(p, d);
            return {
                type: "nil",
                value: undefined,
            };
        },
        {
            params: [
                { name: "filePath", type: "str" },
                { name: "data", type: "str" },
            ],
            returnType: "nil",
        },
    ),
};
