import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Ajeita CSV",
    description: "Ferramenta para abrir, limpar e criar arquivos CSV. Tudo é processado no seu navegador.",
    permissions: ["sidePanel", "storage", "contextMenus", "activeTab", "scripting"],
    action: {
      default_title: "Abrir o Ajeita CSV",
    },
  },
});
