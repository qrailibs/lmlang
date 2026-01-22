module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.ts"],
    moduleNameMapper: {
        "^@lmlang/(.*)$": "<rootDir>/../$1/src",
    },
    globals: {
        "ts-jest": {
            tsconfig: {
                esModuleInterop: true,
            },
        },
    },
};
