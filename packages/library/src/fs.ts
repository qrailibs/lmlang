import path from "path";

export const fs = {
    /**
     * Convert relative to absolute path
     * @param relativePath relative path
     * @returns absolute path
     */
    path: (relativePath: string) => {
        return path.resolve(relativePath);
    },
};
