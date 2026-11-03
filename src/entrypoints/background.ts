export default defineBackground(() => {
  // Clicar no ícone da extensão abre o side panel.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
