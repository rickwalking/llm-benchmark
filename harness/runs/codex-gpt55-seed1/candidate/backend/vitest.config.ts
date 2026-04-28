import { defineConfig } from "vitest/config";
import path from "node:path";

const backendRoot = path.basename(process.cwd()) === "backend" ? process.cwd() : path.join(process.cwd(), "backend");

export default defineConfig({
  root: backendRoot,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000
  }
});
