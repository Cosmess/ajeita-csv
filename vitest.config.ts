import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["tests/**/*.test.ts"],
    // Testes de desempenho rodam à parte, com `pnpm bench`.
    exclude: ["tests/bench/**", "**/node_modules/**"],
  },
});
