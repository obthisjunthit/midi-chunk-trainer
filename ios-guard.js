(() => {
  const app = document.getElementById("app");
  if (!app) return;

  const clearSelection = () => {
    try {
      const selection = window.getSelection?.();
      if (selection && selection.rangeCount) selection.removeAllRanges();
    } catch (_) {}
  };

  // Kill iOS/WKWebView's text-selection and long-press action menu inside the app
  // without disabling pinch zoom at the page level.
  for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
    document.addEventListener(eventName, event => {
      if (event.target?.closest?.("#app")) {
        event.preventDefault();
        clearSelection();
      }
    }, { capture: true });
  }

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    if (element?.closest?.("#app")) clearSelection();
  });

  app.addEventListener("pointerdown", clearSelection, { capture: true });
  app.addEventListener("touchstart", clearSelection, { capture: true, passive: true });
})();
