import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    reporters: [
      "default",
      ["vitest-sonar-reporter", { outputFile: "coverage/sonar-report.xml" }],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "test/",
        "**/*.d.ts",
        "vitest.config.ts",
        "eslint.config.mjs",
      ],
    },
  },
});
