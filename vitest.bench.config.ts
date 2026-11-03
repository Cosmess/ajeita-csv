import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// Testes de desempenho com o arquivo de referência (gerado por `pnpm gen:fixtures`).
// Ficam fora do `pnpm test` e do CI: dependem da máquina e levam alguns minutos.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["tests/bench/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
