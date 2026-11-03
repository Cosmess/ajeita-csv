import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // O Chrome já faz modulepreload; sem o polyfill, o pacote não contém nenhuma chamada fetch.
  vite: () => ({ build: { modulePreload: { polyfill: false } } }),
  manifest: {
    name: "Ajeita CSV",
    description:
      "Ferramenta para abrir, corrigir, limpar e criar arquivos CSV, com foco no Brasil. Tudo é processado no seu navegador.",
    // sidePanel.open (usado pelo menu do botão direito) existe a partir do Chrome 116.
    minimum_chrome_version: "116",
    homepage_url: "https://github.com/Cosmess/ajeita-csv",
    permissions: ["sidePanel", "storage", "contextMenus", "activeTab", "scripting"],
    action: {
      default_title: "Abrir o Ajeita CSV",
    },
  },
});
