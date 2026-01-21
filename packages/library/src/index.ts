import { io } from "./io";
import { fs } from "./fs";

export * from "./types";

export const packages: Record<string, any> = {
    "lmlang/io": io,
    "lmlang/fs": fs,
};
