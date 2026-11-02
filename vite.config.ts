import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
  },
  fmt: {
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [],
  },
});
