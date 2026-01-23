import { io } from "./packages/io";
import { fs } from "./packages/fs";
import { time } from "./packages/time";

export * from "./types";

export const packages: Record<string, any> = {
    "lmlang/io": io,
    "lmlang/fs": fs,
    "lmlang/time": time,
};
