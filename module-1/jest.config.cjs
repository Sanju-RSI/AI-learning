/** @type {import("jest").Config} */
module.exports = {
    testEnvironment: "node",
    testMatch: ["<rootDir>/tests/**/*.test.ts"],
    transform: {
        "^.+\\.ts$": "<rootDir>/jest.esbuild-transform.cjs",
    },
}
