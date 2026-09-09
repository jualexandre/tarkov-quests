import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/vitest.setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
});
