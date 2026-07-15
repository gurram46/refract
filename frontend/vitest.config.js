import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    exclude: [
      "node_modules",
      "dist",
      "src/lib/**/*.test.js",
      "src/components/visuals/workerQueueState.test.js"
    ],
    setupFiles: ["./vitest.setup.js"]
  }
});
